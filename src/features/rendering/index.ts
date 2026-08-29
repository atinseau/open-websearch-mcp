import type { InvestigationId } from "@/features/investigation";

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
}
