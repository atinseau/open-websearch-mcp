import type {
  NavigationScheduler,
  RendererConfiguration,
  RendererSupervisor,
  Renderer,
  RenderRequest,
  RenderedDocument,
} from "@/features/rendering";
import type { PublicUrlPolicy } from "@/features/security";

import { WebViewRenderer } from "./webview-renderer.ts";

/**
 * A navigation whose CDP connection went away, rather than whose page failed.
 *
 * Chrome closes its DevTools socket under load while the process itself stays
 * alive, so the supervisor still reports available and the failure used to fall
 * through as an ordinary error. Each close cost a candidate the search had
 * already discovered and paid to rank.
 */
function lostConnection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /websocket closed|connection closed|target closed|webview closed/iu.test(message);
}

/**
 * A renderer that follows its supervisor across process restarts.
 *
 * The endpoint of a WebView renderer is fixed at construction, so a renderer
 * built once outlived the Obscura process it was bound to: after a crash every
 * later navigation failed as `renderer_unavailable` even though the supervisor
 * could start another process. This rebinds to the current endpoint instead,
 * and retries once when the connection rather than the page was lost
 * (RENDER-008 allows a single retry for a broken target).
 */
export function createReconnectingRenderer(
  supervisor: RendererSupervisor,
  options: {
    readonly configuration: RendererConfiguration;
    readonly scheduler: NavigationScheduler;
    readonly policy: PublicUrlPolicy;
    /** Test seam for exercising a lost connection without waiting for one. */
    readonly renderPage?: (
      request: RenderRequest,
      delegate: (request: RenderRequest) => Promise<RenderedDocument>,
    ) => Promise<RenderedDocument>;
  },
): Renderer {
  let bound: { readonly endpoint: string; readonly renderer: Renderer } | undefined;

  async function attempt(request: RenderRequest): Promise<RenderedDocument> {
    const endpoint = await supervisor.install(new AbortController().signal);
    const key = endpoint.cdpUrl.toString();
    if (bound?.endpoint !== key)
      bound = {
        endpoint: key,
        renderer: new WebViewRenderer({
          endpoint,
          configuration: options.configuration,
          scheduler: options.scheduler,
          policy: options.policy,
        }),
      };
    const page = bound.renderer;
    return options.renderPage
      ? options.renderPage(request, (value) => page.render(value))
      : page.render(request);
  }

  return {
    async render(request) {
      try {
        return await attempt(request);
      } catch (error) {
        const unavailable = !supervisor.status().available;
        if (!unavailable && !lostConnection(error)) throw error;
        // Rebind and try once more: the connection went away, not the page.
        bound = undefined;
        try {
          return await attempt(request);
        } catch (retried) {
          if (!supervisor.status().available)
            throw new Error("renderer_unavailable", { cause: retried });
          throw retried;
        }
      }
    },
  };
}
