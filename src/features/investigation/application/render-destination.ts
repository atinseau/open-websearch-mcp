import type { RenderedDocument, Renderer, RenderRequest } from "@/features/rendering";

import type { CallContext } from "../index.ts";
import { ExpectedFailure } from "./web-research-result.ts";

/**
 * Renders one destination. An absent or failed renderer becomes the typed
 * `renderer_unavailable` outcome rather than a generic error, so a client can
 * tell an infrastructure problem from a page that simply had no evidence.
 */
export async function renderDestination(
  renderer: Renderer | undefined,
  url: URL,
  context: CallContext,
  explicitOpen: boolean,
  conditional?: RenderRequest["conditional"],
): Promise<RenderedDocument> {
  if (!renderer) throw new ExpectedFailure("renderer_unavailable");
  try {
    return await renderer.render({
      url,
      signal: context.abortController.signal,
      investigationId: "pending",
      kind: "destination",
      explicitOpen,
      conditional,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("renderer_unavailable"))
      throw new ExpectedFailure("renderer_unavailable");
    throw error;
  }
}
