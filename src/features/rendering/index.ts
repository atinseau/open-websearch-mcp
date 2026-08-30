import type { InvestigationId } from "@/features/investigation";
import type { PublicUrlPolicy } from "@/features/security";
import { AdaptiveNavigationScheduler } from "@/features/rendering/application/scheduler";
import { ObscuraSupervisor } from "@/features/rendering/adapters/obscura-supervisor";
import { WebViewRenderer } from "@/features/rendering/adapters/webview-renderer";
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
  readonly investigationId: InvestigationId;
  readonly kind: "destination" | "google_serp";
  readonly explicitOpen: boolean;
  /** Google-only anonymous profile, kept distinct from destination contexts. */
  readonly profile?: "google-public";
  /**
   * Validators from a stored copy. When present the renderer asks the origin
   * whether that copy is still current instead of fetching the page again.
   */
  readonly conditional?: {
    readonly etag?: string;
    readonly lastModified?: string;
  };
}

export interface RenderedDocument {
  readonly url: URL;
  readonly text: string;
  readonly markdown: string;
  readonly links: readonly RenderedLink[];
  readonly diagnostics: RenderDiagnostics;
  /**
   * Content type the origin declared for the main document, when it announced
   * one. Extraction needs it to route a PDF or a media file away from the HTML
   * path; assuming `text/html` made binary bytes surface as page evidence.
   */
  readonly contentType?: string;
  /**
   * Cache directives the origin sent for the main document. Freshness follows
   * these when present, so a page is not held past its own expiry and can be
   * revalidated conditionally instead of refetched whole.
   */
  readonly cacheHeaders?: Readonly<Record<string, string>>;
  /**
   * The origin answered that the conditional request's copy is unchanged, so
   * this document carries no new body and the stored evidence still stands.
   */
  readonly notModified?: boolean;
}

export interface RenderedLink {
  readonly url: URL;
  readonly text: string;
}

export interface RenderDiagnostics {
  readonly title: string;
  readonly transferBytes: number;
  readonly settledMs: number;
}

/** Owns the explicitly configured Obscura endpoint and its lifecycle. */
export interface RendererSupervisor {
  install(signal: AbortSignal): Promise<RendererEndpoint>;
  shutdown(): Promise<void>;
  status(): RendererSupervisorStatus;
}

export interface RendererEndpoint {
  readonly cdpUrl: URL;
}

export interface RendererSupervisorStatus {
  readonly ownedProcessId: number | undefined;
  readonly endpoint: URL | undefined;
  /** False once the owned renderer has exited; callers must not reuse its CDP URL. */
  readonly available: boolean;
}

export interface RendererConfiguration {
  readonly navigationTimeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly maxDownloadBytes: number;
}

export { obscuraServeArguments } from "./adapters/obscura-arguments";

export interface ObscuraSupervisorOptions {
  readonly executable: string;
  readonly configuration: RendererConfiguration;
  readonly diagnostic?: (message: string) => void;
  /**
   * Persistent profile directory for the public search profile (SEARCH-003).
   * Omitted keeps the store ephemeral.
   */
  readonly storageDirectory?: string;
  /** Test fixtures only; production rejects this switch unconditionally. */
  readonly allowPrivateNetworkForTest?: boolean;
}

export interface WebViewRendererOptions {
  readonly endpoint: RendererEndpoint;
  readonly configuration: RendererConfiguration;
  readonly scheduler: NavigationScheduler;
  /** Mandatory public-destination gate. It is evaluated before every navigation. */
  readonly policy: PublicUrlPolicy;
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

/** Starts only the pinned Obscura executable owned by this MCP process. */
export function createObscuraSupervisor(options: ObscuraSupervisorOptions): RendererSupervisor {
  return new ObscuraSupervisor(options);
}

/** Creates the sole selected Bun.WebView renderer adapter. */
export function createWebViewRenderer(options: WebViewRendererOptions): Renderer {
  return new WebViewRenderer(options);
}

export { createReconnectingRenderer } from "./adapters/reconnecting-renderer";
