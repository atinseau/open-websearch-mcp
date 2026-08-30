import type { SchedulerConfiguration } from "@/features/configuration";
import type {
  NavigationRequest,
  NavigationScheduler,
  NavigationSchedulerOptions,
  RssTelemetry,
  SchedulerClock,
  SchedulerStatus,
} from "@/features/rendering";
import { AdaptiveController } from "@/features/rendering/application/controller";

type Deferred<Result> = {
  resolve(value: Result | PromiseLike<Result>): void;
  reject(reason?: unknown): void;
};
type QueueEntry<Result> = {
  readonly request: NavigationRequest;
  readonly operation: (signal: AbortSignal) => Promise<Result>;
  readonly deferred: Deferred<Result>;
  readonly controller: AbortController;
  readonly enqueuedAt: number;
  startedAt: number | undefined;
  state: "queued" | "active" | "settled";
  timeout: unknown;
  cancel: () => void;
};

const systemClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => {
    const key = nextTimerKey++;
    systemTimers.set(
      key,
      setTimeout(() => callback(), delayMs),
    );
    return key;
  },
  clearTimeout: (timer) => {
    if (typeof timer !== "number") return;
    const nativeTimer = systemTimers.get(timer);
    if (nativeTimer !== undefined) clearTimeout(nativeTimer);
    systemTimers.delete(timer);
  },
};
const systemTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextTimerKey = 0;

/** Fair queue plus calibrated feedback controller for process-wide rendering. */
export class AdaptiveNavigationScheduler implements NavigationScheduler {
  readonly #configuration: SchedulerConfiguration;
  readonly #clock: SchedulerClock;
  readonly #telemetry: RssTelemetry | undefined;
  readonly #navigationTimeoutMs: number;
  readonly #queues = new Map<string, QueueEntry<unknown>[]>();
  readonly #hosts = new Map<string, number>();
  readonly #activeEntries = new Set<QueueEntry<unknown>>();
  readonly #controller: AdaptiveController;
  #lastInvestigation = "";
  #preferExplicit = true;
  #active = 0;
  #serpActive = 0;
  #closed = false;

  constructor(options: NavigationSchedulerOptions) {
    this.#configuration = options.configuration;
    this.#clock = options.clock ?? systemClock;
    this.#telemetry = options.telemetry;
    this.#navigationTimeoutMs = options.navigationTimeoutMs ?? 15_000;
    this.#controller = new AdaptiveController(
      options.configuration,
      this.#clock,
      this.#telemetry,
      () => this.#dispatch(),
    );
  }

  schedule<Result>(
    request: NavigationRequest,
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> {
    if (this.#closed) return Promise.reject(new Error("navigation_scheduler_shutdown"));
    if (request.signal.aborted) return Promise.reject(abortError(request.signal.reason));
    return new Promise<Result>((resolve, reject) => {
      const entry = this.#entry(request, operation, { resolve, reject });
      const queue = this.#queues.get(request.investigationId) ?? [];
      queue.push(entry);
      this.#queues.set(request.investigationId, queue);
      request.signal.addEventListener("abort", entry.cancel, { once: true });
      this.#dispatch();
    });
  }

  status(): SchedulerStatus {
    return {
      capacity: this.#controller.capacity(),
      active: this.#active,
      queued: this.#queuedCount(),
    };
  }

  async shutdown(): Promise<void> {
    this.#closed = true;
    this.#controller.close();
    for (const queue of this.#queues.values())
      for (const entry of Array.from(queue)) this.#cancel(entry);
    for (const entry of Array.from(this.#activeEntries)) this.#cancel(entry);
  }

  #entry<Result>(
    request: NavigationRequest,
    operation: (signal: AbortSignal) => Promise<Result>,
    deferred: Deferred<Result>,
  ): QueueEntry<Result> {
    const entry: QueueEntry<Result> = {
      request,
      operation,
      deferred,
      controller: new AbortController(),
      enqueuedAt: this.#clock.now(),
      startedAt: undefined,
      state: "queued" as const,
      timeout: undefined,
      cancel: (): void => undefined,
    };
    entry.cancel = () => this.#cancel(entry);
    return entry;
  }

  #dispatch(): void {
    while (!this.#closed && this.#active < this.#controller.capacity()) {
      const entry = this.#nextEligible();
      if (!entry) return;
      this.#start(entry);
    }
  }

  #nextEligible(): QueueEntry<unknown> | undefined {
    const kind = this.#nextKind();
    return (
      this.#nextFromInvestigations(kind) ??
      this.#nextFromInvestigations(kind === "open" ? "other" : "open")
    );
  }

  #nextKind(): "open" | "other" {
    const hasOpen = this.#hasEligible("open");
    const hasOther = this.#hasEligible("other");
    if (hasOpen && (!hasOther || this.#preferExplicit)) {
      this.#preferExplicit = false;
      return "open";
    }
    this.#preferExplicit = true;
    return "other";
  }

  #hasEligible(kind: "open" | "other"): boolean {
    return [...this.#queues.values()].some((queue) =>
      queue.some((entry) => this.#matches(entry, kind) && this.#eligible(entry)),
    );
  }

  #nextFromInvestigations(kind: "open" | "other"): QueueEntry<unknown> | undefined {
    const investigations = [...this.#queues.keys()];
    const lastIndex = investigations.indexOf(this.#lastInvestigation);
    const start = lastIndex < 0 ? 0 : (lastIndex + 1) % investigations.length;
    for (let offset = 0; offset < investigations.length; offset += 1) {
      const index = (start + offset) % investigations.length;
      const queue = this.#queues.get(investigations[index] ?? "") ?? [];
      const entry = queue.find(
        (candidate) => this.#matches(candidate, kind) && this.#eligible(candidate),
      );
      if (entry) {
        this.#lastInvestigation = investigations[index] ?? "";
        return entry;
      }
    }
    return undefined;
  }

  #matches(entry: QueueEntry<unknown>, kind: "open" | "other"): boolean {
    return entry.request.explicitOpen === (kind === "open");
  }

  #eligible(entry: QueueEntry<unknown>): boolean {
    return (
      entry.state === "queued" &&
      (entry.request.kind !== "google_serp" ||
        this.#serpActive < this.#configuration.googleSerpCapacity) &&
      (this.#hosts.get(entry.request.host) ?? 0) < this.#configuration.perHostCapacity
    );
  }

  #start(entry: QueueEntry<unknown>): void {
    entry.state = "active";
    entry.startedAt = this.#clock.now();
    // The budget covers the navigation itself. Starting it when the entry was
    // queued made a candidate waiting behind the host limit fail before its own
    // navigation began, which reads as a slow site rather than our scheduling.
    entry.timeout = this.#clock.setTimeout(
      () => this.#timeout(entry),
      entry.request.timeoutMs ?? this.#navigationTimeoutMs,
    );
    this.#active += 1;
    this.#activeEntries.add(entry);
    this.#claim(entry);
    this.#removeQueued(entry);
    void Promise.resolve()
      .then(() => entry.operation(entry.controller.signal))
      .then(
        (result) => this.#settle(entry, { result }),
        (error) => this.#settle(entry, { error }),
      );
  }

  #timeout(entry: QueueEntry<unknown>): void {
    if (entry.state === "settled") return;
    entry.controller.abort("navigation_timeout");
    this.#settle(entry, { error: new Error("navigation_timeout"), timedOut: true });
  }

  #cancel(entry: QueueEntry<unknown>): void {
    if (entry.state === "settled") return;
    entry.controller.abort(entry.request.signal.reason);
    this.#settle(entry, { error: abortError(entry.request.signal.reason), cancelled: true });
  }

  #settle(
    entry: QueueEntry<unknown>,
    outcome: {
      readonly result?: unknown;
      readonly error?: unknown;
      readonly timedOut?: boolean;
      readonly cancelled?: boolean;
    },
  ): void {
    if (entry.state === "settled") return;
    const wasActive = entry.state === "active";
    entry.state = "settled";
    entry.request.signal.removeEventListener("abort", entry.cancel);
    if (entry.timeout !== undefined) this.#clock.clearTimeout(entry.timeout);
    if (wasActive) this.#release(entry);
    else this.#removeQueued(entry);
    if (!outcome.cancelled)
      this.#complete(entry, Boolean(outcome.error), Boolean(outcome.timedOut));
    if (outcome.error !== undefined) entry.deferred.reject(outcome.error);
    else entry.deferred.resolve(outcome.result);
    this.#dispatch();
  }

  #claim(entry: QueueEntry<unknown>): void {
    this.#hosts.set(entry.request.host, (this.#hosts.get(entry.request.host) ?? 0) + 1);
    if (entry.request.kind === "google_serp") this.#serpActive += 1;
  }

  #release(entry: QueueEntry<unknown>): void {
    this.#active -= 1;
    this.#activeEntries.delete(entry);
    const hostActive = (this.#hosts.get(entry.request.host) ?? 1) - 1;
    if (hostActive) this.#hosts.set(entry.request.host, hostActive);
    else this.#hosts.delete(entry.request.host);
    if (entry.request.kind === "google_serp") this.#serpActive -= 1;
  }

  #removeQueued(entry: QueueEntry<unknown>): void {
    const queue = this.#queues.get(entry.request.investigationId);
    if (!queue) return;
    const index = queue.indexOf(entry);
    if (index >= 0) queue.splice(index, 1);
    if (!queue.length) this.#queues.delete(entry.request.investigationId);
  }

  #complete(entry: QueueEntry<unknown>, failed: boolean, timedOut: boolean): void {
    this.#controller.record({
      durationMs: this.#clock.now() - (entry.startedAt ?? entry.enqueuedAt),
      failed,
      timedOut,
    });
  }

  #queuedCount(): number {
    return [...this.#queues.values()].reduce((count, queue) => count + queue.length, 0);
  }
}

function abortError(reason: unknown): DOMException {
  return new DOMException(typeof reason === "string" ? reason : "navigation_aborted", "AbortError");
}
