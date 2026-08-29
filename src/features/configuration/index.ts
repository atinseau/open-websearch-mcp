/** A duration measured in milliseconds. */
export type Milliseconds = number;

/** Immutable configuration captured when an MCP call begins. */
export interface ConfigurationSnapshot {
  readonly scheduler: SchedulerConfiguration;
}

/** Values controlling the process-global navigation scheduler. */
export interface SchedulerConfiguration {
  readonly startCapacity: number;
  readonly maximumCapacity: number;
  readonly lastSafeCapacity: number;
  readonly perHostCapacity: number;
  readonly googleSerpCapacity: number;
  readonly safeRssBudgetBytes: number;
  readonly warmP95BaselineMs: Milliseconds;
  readonly memoryTelemetryAbsentMaximumCapacity: number;
  readonly growthStep: number;
  readonly healthyWindowsRequired: number;
  readonly windowCompletedNavigations: number;
  readonly minimumWindowMs: Milliseconds;
  readonly backpressure: SchedulerBackpressure;
}

export interface SchedulerBackpressure {
  readonly errorRate: number;
  readonly timeoutRate: number;
  readonly p95WarmBaselineMultiplier: number;
  readonly rssSafeBudgetFraction: number;
  readonly action: "halve_ceiling_minimum_1";
}

/** Supplies the snapshot that is frozen for one MCP call. */
export interface ConfigurationProvider {
  snapshot(): ConfigurationSnapshot;
}
