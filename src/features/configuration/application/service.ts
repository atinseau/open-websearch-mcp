import {
  configurationSchema,
  defaultConfiguration,
  isRecord,
  mergeDefaults,
  schemaVersion,
  type FullConfiguration,
} from "@/features/configuration/domain/configuration";
import { defaultToml } from "@/features/configuration/domain/template";
import {
  ensureWorkspace,
  renameAtomically,
  resolveWorkspace,
  type Workspace,
} from "@/features/configuration/adapters/workspace";
import type { ConfigurationSnapshot, SchedulerConfiguration } from "@/features/configuration";

export interface ConfigurationServiceOptions {
  readonly workspace?: Workspace;
  readonly physicalMemoryBytes?: () => number | undefined;
  readonly diagnostic?: (message: string) => void;
  readonly migrationFailAfterBackup?: boolean;
}

export interface ConfigurationService {
  prepareForCall(): Promise<ConfigurationSnapshot>;
  snapshot(): ConfigurationSnapshot;
  configuration(): Readonly<FullConfiguration>;
  workspace(): Workspace;
  persistMachineProfile(sample: MachineProfile): Promise<void>;
  doctor(): Promise<DoctorReport>;
}

export interface MachineProfile {
  readonly warmP95Ms: number;
  readonly rssBytes: number;
  readonly highestHealthyCapacity: number;
}
export interface DoctorReport {
  readonly workspace: boolean;
  readonly config: boolean;
  readonly schema: boolean;
  readonly diskWritable: boolean;
  readonly obscuraInstalled: boolean;
}

export function createConfigurationService(
  options: ConfigurationServiceOptions = {},
): ConfigurationService {
  return new StatefulConfiguration(options);
}

class StatefulConfiguration implements ConfigurationService {
  readonly #workspace: Workspace;
  readonly #report: (message: string) => void;
  readonly #options: ConfigurationServiceOptions;
  #configuration = deepFreeze(defaultConfiguration);
  #snapshot: ConfigurationSnapshot;
  #stamp = "";
  constructor(options: ConfigurationServiceOptions) {
    this.#options = options;
    this.#workspace = this.#options.workspace ?? resolveWorkspace();
    this.#report =
      this.#options.diagnostic ?? ((message) => console.error(`[open-websearch-mcp] ${message}`));
    this.#snapshot = deepFreeze(
      toSnapshot(this.#configuration, 8, this.#options.physicalMemoryBytes),
    );
  }
  async prepareForCall(): Promise<ConfigurationSnapshot> {
    ensureWorkspace(this.#workspace);
    if (!(await Bun.file(this.#workspace.config).exists()))
      await Bun.write(this.#workspace.config, defaultToml());
    const source = await Bun.file(this.#workspace.config).text();
    if (source !== this.#stamp) await this.reload(source);
    return this.#snapshot;
  }
  snapshot(): ConfigurationSnapshot {
    return this.#snapshot;
  }
  configuration(): Readonly<FullConfiguration> {
    return this.#configuration;
  }
  workspace(): Workspace {
    return this.#workspace;
  }
  async persistMachineProfile(sample: MachineProfile): Promise<void> {
    ensureWorkspace(this.#workspace);
    await Bun.write(
      this.#workspace.profile,
      toml({
        warm_p95_ms: sample.warmP95Ms,
        rss_bytes: sample.rssBytes,
        highest_healthy_capacity: sample.highestHealthyCapacity,
      }),
    );
  }
  async doctor(): Promise<DoctorReport> {
    try {
      await this.prepareForCall();
      return {
        workspace: true,
        config: true,
        schema: true,
        diskWritable: true,
        obscuraInstalled: await Bun.file(
          `${this.#workspace.root}/bin/obscura/${this.#configuration.renderer.obscura.version}`,
        ).exists(),
      };
    } catch {
      return {
        workspace: false,
        config: false,
        schema: false,
        diskWritable: false,
        obscuraInstalled: false,
      };
    }
  }
  async reload(source: string): Promise<void> {
    try {
      let raw = Bun.TOML.parse(source);
      if (!isRecord(raw)) throw new Error("config_root_must_be_table");
      if (typeof raw.schema_version === "number" && raw.schema_version < schemaVersion) {
        await this.migrate(raw);
        raw = Bun.TOML.parse(await Bun.file(this.#workspace.config).text());
      }
      if (!isRecord(raw)) throw new Error("config_root_must_be_table");
      this.#configuration = deepFreeze(configurationSchema.parse(mergeDefaults(raw)));
      this.#snapshot = deepFreeze(
        toSnapshot(
          this.#configuration,
          await healthyCapacity(this.#workspace),
          this.#options.physicalMemoryBytes,
        ),
      );
      this.#stamp = await Bun.file(this.#workspace.config).text();
    } catch (error) {
      this.#report(`invalid_config_reload: ${errorMessage(error)}`);
    }
  }
  async migrate(raw: Record<string, unknown>): Promise<void> {
    await Bun.write(`${this.#workspace.config}.bak`, await Bun.file(this.#workspace.config).text());
    if (this.#options.migrationFailAfterBackup)
      throw new Error("migration_interrupted_after_backup");
    const temporary = `${this.#workspace.config}.tmp`;
    await Bun.write(temporary, toml(mergeDefaults({ ...raw, schema_version: schemaVersion })));
    renameAtomically(temporary, this.#workspace.config);
  }
}

async function healthyCapacity(workspace: Workspace): Promise<number> {
  if (!(await Bun.file(workspace.profile).exists())) return 8;
  try {
    const profile = Bun.TOML.parse(await Bun.file(workspace.profile).text());
    return isRecord(profile) && typeof profile.highest_healthy_capacity === "number"
      ? profile.highest_healthy_capacity
      : 8;
  } catch {
    return 8;
  }
}

function toSnapshot(
  config: FullConfiguration,
  persistedCapacity: number,
  physicalMemory: (() => number | undefined) | undefined,
): ConfigurationSnapshot {
  const controller = config.experimental.renderer_controller;
  const autoBudget = physicalMemory?.();
  const safeRssBudgetBytes =
    controller.rss_budget_bytes || (autoBudget ? Math.min(autoBudget / 4, 4 * 1024 ** 3) : 0);
  const scheduler: SchedulerConfiguration = {
    startCapacity: config.renderer.initial_concurrency,
    maximumCapacity: config.renderer.max_concurrency,
    lastSafeCapacity: persistedCapacity,
    perHostCapacity: config.renderer.max_per_host,
    googleSerpCapacity: config.google.max_concurrent_serp,
    safeRssBudgetBytes,
    warmP95BaselineMs: 456,
    memoryTelemetryAbsentMaximumCapacity: persistedCapacity,
    growthStep: controller.growth_step,
    healthyWindowsRequired: controller.healthy_windows_before_growth,
    windowCompletedNavigations: controller.window_completions,
    minimumWindowMs: controller.window_min_ms,
    backpressure: {
      errorRate: controller.error_decrease_threshold,
      timeoutRate: controller.timeout_decrease_threshold,
      p95WarmBaselineMultiplier: controller.p95_baseline_multiplier,
      rssSafeBudgetFraction: controller.rss_budget_ratio,
      action: "halve_ceiling_minimum_1",
    },
  };
  return { scheduler, configuration: config };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
function toml(value: object): string {
  const output = Bun.TOML.stringify(value);
  if (!output) throw new Error("toml_stringify_failed");
  return output;
}
function deepFreeze<Value>(value: Value): Readonly<Value> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
