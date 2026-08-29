import type { FullConfiguration } from "@/features/configuration/domain/configuration";

/** A duration measured in milliseconds. */
export type Milliseconds = number;

/** Immutable configuration captured when an MCP call begins. */
export interface ConfigurationSnapshot {
  readonly scheduler: SchedulerConfiguration;
  /** Full validated configuration, immutable for the duration of an MCP call. */
  readonly configuration?: Readonly<FullConfiguration>;
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

export type { FullConfiguration } from "@/features/configuration/domain/configuration";
export interface Workspace {
  readonly root: string;
  readonly config: string;
  readonly profile: string;
  readonly logs: string;
}
export {
  configurationSchema,
  defaultConfiguration,
} from "@/features/configuration/domain/configuration";
export { createSessionLogger, type SessionLogger } from "@/features/configuration/adapters/logger";
export {
  createConfigurationService,
  type ConfigurationService,
  type ConfigurationServiceOptions,
  type DoctorReport,
  type MachineProfile,
} from "@/features/configuration/application/service";
export { renameAtomically, resolveWorkspace } from "@/features/configuration/adapters/workspace";
