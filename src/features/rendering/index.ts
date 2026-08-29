import type { InvestigationId } from "@/features/investigation";
import { AdaptiveNavigationScheduler } from "@/features/rendering/application/scheduler";
export {
  createObscuraInstaller,
  type ObscuraArtifact,
  type ObscuraInstaller,
} from "@/features/rendering/adapters/installer";
export type { ObscuraTransport } from "@/features/rendering/adapters/obscura-transport";

/** The only production document-rendering capability. */
export interface Renderer {
  render(input: RenderRequest): Promise<RenderedDocument>;
}

export interface RenderRequest {
  readonly url: URL;
  readonly signal: AbortSignal;
}

export interface RenderedDocument {
  readonly url: URL;
  readonly text: string;
}

/** Owns the explicitly configured Obscura endpoint and its lifecycle. */
export interface RendererSupervisor {
  install(signal: AbortSignal): Promise<RendererEndpoint>;
  shutdown(): Promise<void>;
}

export interface RendererEndpoint {
  readonly cdpUrl: URL;
}

/** Process-global, fair, cancellable navigation scheduling seam. */
export interface NavigationScheduler {
  schedule<Result>(
    request: NavigationRequest,
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result>;
  shutdown(): Promise<void>;
}

export interface NavigationRequest {
  readonly investigationId: InvestigationId;
  readonly host: string;
  readonly kind: "destination" | "google_serp";
  readonly explicitOpen: boolean;
  readonly signal: AbortSignal;
  /** Navigation deadline; defaults to the configured renderer deadline. */
  readonly timeoutMs?: number;
}

export interface SchedulerClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface RssTelemetry {
  rssBytes(): number | undefined;
}

export interface NavigationSchedulerOptions {
  readonly configuration: import("@/features/configuration").SchedulerConfiguration;
  readonly clock?: SchedulerClock;
  readonly telemetry?: RssTelemetry;
  readonly navigationTimeoutMs?: number;
}

export interface SchedulerStatus {
  readonly capacity: number;
  readonly active: number;
  readonly queued: number;
}

/** Creates the one process-global scheduler owned by the composition root. */
export function createNavigationScheduler(
  options: NavigationSchedulerOptions,
): NavigationScheduler & { status(): SchedulerStatus } {
  return new AdaptiveNavigationScheduler(options);
}
