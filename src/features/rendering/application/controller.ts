import type { SchedulerConfiguration } from "@/features/configuration";
import type { RssTelemetry, SchedulerClock } from "@/features/rendering";

type Completion = {
  readonly durationMs: number;
  readonly failed: boolean;
  readonly timedOut: boolean;
};

/** Applies the calibrated, versioned adaptive-capacity policy. */
export class AdaptiveController {
  readonly #configuration: SchedulerConfiguration;
  readonly #clock: SchedulerClock;
  readonly #telemetry: RssTelemetry | undefined;
  readonly #onChange: () => void;
  #capacity: number;
  #windowStartedAt: number;
  #window: Completion[] = [];
  #healthyWindows = 0;
  #timer: unknown;

  constructor(
    configuration: SchedulerConfiguration,
    clock: SchedulerClock,
    telemetry: RssTelemetry | undefined,
    onChange: () => void,
  ) {
    this.#configuration = configuration;
    this.#clock = clock;
    this.#telemetry = telemetry;
    this.#onChange = onChange;
    this.#capacity = configuration.startCapacity;
    this.#windowStartedAt = clock.now();
  }

  capacity(): number {
    return this.#capacity;
  }

  record(completion: Completion): void {
    this.#window.push(completion);
    if (this.#window.length >= this.#configuration.windowCompletedNavigations)
      this.#armEvaluation();
  }

  close(): void {
    if (this.#timer !== undefined) this.#clock.clearTimeout(this.#timer);
  }

  #armEvaluation(): void {
    const remaining =
      this.#configuration.minimumWindowMs - (this.#clock.now() - this.#windowStartedAt);
    if (remaining <= 0) this.#evaluate();
    else if (this.#timer === undefined)
      this.#timer = this.#clock.setTimeout(() => this.#evaluateIfDue(), remaining);
  }

  #evaluateIfDue(): void {
    if (
      this.#window.length >= this.#configuration.windowCompletedNavigations &&
      this.#clock.now() - this.#windowStartedAt >= this.#configuration.minimumWindowMs
    )
      this.#evaluate();
  }

  #evaluate(): void {
    if (this.#timer !== undefined) this.#clock.clearTimeout(this.#timer);
    this.#timer = undefined;
    const unhealthy = this.#unhealthy();
    if (unhealthy) this.#capacity = Math.max(1, Math.ceil(this.#capacity / 2));
    this.#healthyWindows = unhealthy ? 0 : this.#healthyWindows + 1;
    if (this.#healthyWindows >= this.#configuration.healthyWindowsRequired) this.#grow();
    this.#window = [];
    this.#windowStartedAt = this.#clock.now();
    this.#onChange();
  }

  #unhealthy(): boolean {
    const total = this.#window.length;
    const errors = this.#window.filter((entry) => entry.failed).length / total;
    const timeouts = this.#window.filter((entry) => entry.timedOut).length / total;
    const p95 = percentile95(this.#window.map((entry) => entry.durationMs));
    const rss = this.#telemetry?.rssBytes();
    return (
      errors > this.#configuration.backpressure.errorRate ||
      timeouts > this.#configuration.backpressure.timeoutRate ||
      p95 >
        this.#configuration.warmP95BaselineMs *
          this.#configuration.backpressure.p95WarmBaselineMultiplier ||
      (rss !== undefined &&
        rss >
          this.#configuration.safeRssBudgetBytes *
            this.#configuration.backpressure.rssSafeBudgetFraction)
    );
  }

  #grow(): void {
    const ceiling =
      this.#telemetry?.rssBytes() === undefined
        ? this.#configuration.memoryTelemetryAbsentMaximumCapacity
        : this.#configuration.maximumCapacity;
    this.#capacity = Math.min(this.#capacity + this.#configuration.growthStep, ceiling);
    this.#healthyWindows = 0;
  }
}

function percentile95(samples: readonly number[]): number {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0;
}
