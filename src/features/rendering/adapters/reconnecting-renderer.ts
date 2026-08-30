import type {
  NavigationScheduler,
  RendererConfiguration,
  RendererSupervisor,
  Renderer,
} from "@/features/rendering";
import type { PublicUrlPolicy } from "@/features/security";

import { WebViewRenderer } from "./webview-renderer.ts";

/**
 * A renderer that follows its supervisor across process restarts.
 *
 * The endpoint of a WebView renderer is fixed at construction, so a renderer
 * built once outlived the Obscura process it was bound to: after a crash every
 * later navigation failed as `renderer_unavailable` even though the supervisor
 * could start another process. A corpus run turned one crash into a whole run
 * of failures. This rebinds to the current endpoint instead.
 */
export function createReconnectingRenderer(
  supervisor: RendererSupervisor,
  options: {
    readonly configuration: RendererConfiguration;
    readonly scheduler: NavigationScheduler;
    readonly policy: PublicUrlPolicy;
  },
): Renderer {
  let bound: { readonly endpoint: string; readonly renderer: Renderer } | undefined;
  return {
    async render(request) {
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
      try {
        return await bound.renderer.render(request);
      } catch (error) {
        // A navigation that failed because the process went away is reported as
        // unavailable, and the next call rebinds to whatever replaces it.
        if (!supervisor.status().available) {
          bound = undefined;
          throw new Error("renderer_unavailable", { cause: error });
        }
        throw error;
      }
    },
  };
}
