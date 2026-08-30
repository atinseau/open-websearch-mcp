import { expect, test } from "bun:test";

import {
  createNavigationScheduler,
  type NavigationRequest,
  type SchedulerClock,
} from "@/features/rendering";

type Timer = { readonly at: number; readonly callback: () => void; cancelled: boolean };

class FakeClock implements SchedulerClock {
  #now = 0;
  readonly #timers: Timer[] = [];
  now(): number {
    return this.#now;
  }
  setTimeout(callback: () => void, delayMs: number): Timer {
    const timer = { at: this.#now + delayMs, callback, cancelled: false };
    this.#timers.push(timer);
    return timer;
  }
  clearTimeout(timer: unknown): void {
    if (isTimer(timer)) timer.cancelled = true;
  }
  /**
   * Steps to each due deadline in turn rather than jumping to the end, so a
   * timer created by a callback during the advance starts from the time it was
   * actually created instead of being born already expired.
   */
  advance(milliseconds: number): void {
    const target = this.#now + milliseconds;
    for (;;) {
      const due = this.#timers
        .filter((candidate) => !candidate.cancelled && candidate.at <= target)
        .sort((left, right) => left.at - right.at)[0];
      if (!due) break;
      this.#now = Math.max(this.#now, due.at);
      due.cancelled = true;
      due.callback();
    }
    this.#now = target;
  }
}

const calibrated = {
  startCapacity: 8,
  maximumCapacity: 40,
  lastSafeCapacity: 16,
  perHostCapacity: 2,
  googleSerpCapacity: 1,
  safeRssBudgetBytes: 201_326_592,
  warmP95BaselineMs: 456,
  memoryTelemetryAbsentMaximumCapacity: 16,
  growthStep: 2,
  healthyWindowsRequired: 2,
  windowCompletedNavigations: 20,
  minimumWindowMs: 10_000,
  backpressure: {
    errorRate: 0.15,
    timeoutRate: 0.1,
    p95WarmBaselineMultiplier: 2,
    rssSafeBudgetFraction: 0.8,
    action: "halve_ceiling_minimum_1" as const,
  },
} as const;

function request(index: number, changes: Partial<NavigationRequest> = {}): NavigationRequest {
  return {
    investigationId: `investigation-${index}`,
    host: `host-${index}.test`,
    kind: "destination",
    explicitOpen: false,
    signal: new AbortController().signal,
    ...changes,
  };
}

async function window(
  scheduler: ReturnType<typeof createNavigationScheduler>,
  clock: FakeClock,
  outcome: "success" | "error" | "slow" | "timeout" = "success",
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const pending = scheduler.schedule(
      request(index, { timeoutMs: outcome === "timeout" ? 1 : undefined }),
      (signal) => {
        if (outcome === "error") return Promise.reject(new Error("navigation_error"));
        if (outcome === "slow") {
          clock.advance(913);
          return Promise.resolve("slow");
        }
        if (outcome === "timeout")
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        return Promise.resolve("ok");
      },
    );
    if (outcome === "timeout") clock.advance(1);
    await pending.catch(() => undefined);
  }
  clock.advance(10_000);
}

test("ORCH-004 round-robins investigations", async () => {
  const clock = new FakeClock();
  const scheduler = createNavigationScheduler({
    configuration: { ...calibrated, startCapacity: 1 },
    clock,
  });
  const starts: string[] = [];
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const first = scheduler.schedule(request(1), async () => {
    starts.push("a1");
    await gate;
  });
  const second = scheduler.schedule(request(1), async () => starts.push("a2"));
  const third = scheduler.schedule(request(2), async () => starts.push("b1"));
  release();
  await Promise.all([first, second, third]);
  expect(starts).toEqual(["a1", "b1", "a2"]);
});

test("ORCH-002 grows only after two healthy calibrated windows", async () => {
  const clock = new FakeClock();
  const scheduler = createNavigationScheduler({
    configuration: calibrated,
    clock,
    telemetry: { rssBytes: () => 1 },
  });
  await window(scheduler, clock);
  expect(scheduler.status().capacity).toBe(8);
  await window(scheduler, clock);
  expect(scheduler.status().capacity).toBe(10);
});

for (const [name, outcome, telemetry] of [
  ["errors above 15%", "error", () => 1],
  ["timeouts above 10%", "timeout", () => 1],
  ["P95 above twice 456ms", "slow", () => 1],
  ["RSS above 80% of 192MiB", "success", () => 161_061_274],
] as const)
  test(`ORCH-002 halves capacity for ${name}`, async () => {
    const clock = new FakeClock();
    const scheduler = createNavigationScheduler({
      configuration: calibrated,
      clock,
      telemetry: { rssBytes: telemetry },
    });
    await window(scheduler, clock, outcome);
    expect(scheduler.status().capacity).toBe(4);
  });

test("ORCH-002 holds capacity inside the backpressure band", async () => {
  const clock = new FakeClock();
  const scheduler = createNavigationScheduler({
    configuration: calibrated,
    clock,
    telemetry: { rssBytes: () => 1 },
  });
  for (let index = 0; index < 20; index += 1)
    await scheduler
      .schedule(request(index), () =>
        index < 3 ? Promise.reject(new Error("bounded_error")) : Promise.resolve("ok"),
      )
      .catch(() => undefined);
  clock.advance(10_000);
  expect(scheduler.status().capacity).toBe(8);
});

test("ORCH-002 caps no-RSS growth at calibrated safe capacity but retains backpressure", async () => {
  const clock = new FakeClock();
  const scheduler = createNavigationScheduler({
    configuration: { ...calibrated, startCapacity: 16 },
    clock,
  });
  await window(scheduler, clock);
  await window(scheduler, clock);
  expect(scheduler.status().capacity).toBe(16);
  await window(scheduler, clock, "error");
  expect(scheduler.status().capacity).toBe(8);
});

test("ORCH-003 and SEARCH-004 enforce host and Google SERP limits", async () => {
  const scheduler = createNavigationScheduler({
    configuration: { ...calibrated, startCapacity: 4 },
  });
  const gates: Array<() => void> = [];
  const hold = () => new Promise<void>((resolve) => gates.push(resolve));
  const sameHost = [0, 1, 2].map((index) =>
    scheduler.schedule(request(index, { host: "same.test" }), hold),
  );
  const serp = [3, 4].map((index) =>
    scheduler.schedule(request(index, { kind: "google_serp", host: `google-${index}.test` }), hold),
  );
  expect(scheduler.status().active).toBe(3);
  await scheduler.shutdown();
  await Promise.all([...sameHost, ...serp].map((pending) => pending.catch(() => undefined)));
});

test("ORCH-004 gives web_open one turn of priority without starving a normal investigation", async () => {
  const scheduler = createNavigationScheduler({
    configuration: { ...calibrated, startCapacity: 1 },
  });
  const starts: string[] = [];
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const first = scheduler.schedule(request(1), async () => {
    starts.push("normal-active");
    await gate;
  });
  const normal = scheduler.schedule(request(2), async () => starts.push("normal-waits"));
  const open = scheduler.schedule(request(3, { explicitOpen: true }), async () =>
    starts.push("open"),
  );
  release();
  await Promise.all([first, normal, open]);
  expect(starts).toEqual(["normal-active", "open", "normal-waits"]);
});

test("ORCH-006 and ORCH-007 remove cancellation from the active slot", async () => {
  const scheduler = createNavigationScheduler({
    configuration: { ...calibrated, startCapacity: 1 },
  });
  const cancelled = new AbortController();
  const first = scheduler.schedule(
    request(1, { signal: cancelled.signal }),
    () => new Promise(() => undefined),
  );
  const second = scheduler.schedule(request(2), () => Promise.resolve("released"));
  cancelled.abort("client_cancelled");
  const cancelledMessage = await first.then(
    () => "not_cancelled",
    (error: unknown) => (error instanceof Error ? error.message : "unknown"),
  );
  expect(cancelledMessage).toContain("client_cancelled");
  expect(await second).toBe("released");
  expect(scheduler.status().active).toBe(0);
});

function isTimer(value: unknown): value is Timer {
  return typeof value === "object" && value !== null && "cancelled" in value;
}

test("RENDER-007 the navigation timeout measures navigation, not time spent queued", async () => {
  // A search prepares many candidates at once, so most wait behind the host
  // limit. Counting queue time against the navigation budget made a candidate
  // fail before its own navigation had started, which reads as a slow site
  // rather than as our own scheduling.
  const clock = new FakeClock();
  const scheduler = createNavigationScheduler({ configuration: calibrated, clock });
  const started: number[] = [];
  const settle: Array<() => void> = [];
  const run = (index: number) =>
    scheduler.schedule(
      // One host, so the per-host limit of 2 forces the rest to queue.
      request(index, { host: "docs.test", investigationId: "one", timeoutMs: 1_000 }),
      () => {
        started.push(index);
        return new Promise<string>((resolve) => settle.push(() => resolve("ok")));
      },
    );

  const inFlight = [run(0), run(1), run(2), run(3)];
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  expect(started).toHaveLength(2);

  // The first pair navigates slowly but inside its own budget, so the queued
  // pair has already waited most of a budget by the time its turn comes.
  clock.advance(900);
  settle.shift()?.();
  settle.shift()?.();
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(started).toHaveLength(4);

  // Their own navigations take 900ms too. Counted from enqueue that is 1800ms
  // and would time out; counted from their own start it is inside budget.
  clock.advance(900);
  settle.shift()?.();
  settle.shift()?.();
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();

  const outcomes = await Promise.allSettled(inFlight);
  const timedOut = outcomes.filter(
    (outcome) =>
      outcome.status === "rejected" && String(outcome.reason?.message) === "navigation_timeout",
  );
  expect(timedOut).toHaveLength(0);
  await scheduler.shutdown();
});
