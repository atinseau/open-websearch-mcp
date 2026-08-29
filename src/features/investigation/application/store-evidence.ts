import type { ExtractionResult } from "@/features/extraction";
import type { RenderedDocument } from "@/features/rendering";
import type { Storage } from "@/features/storage";

import type { CallContext } from "../index.ts";

/**
 * Stores a rendered page as reusable evidence. The declared content type is
 * carried through so freshness follows the origin's own cache directives,
 * including `no-store`, which the cache refuses to persist at all.
 */
export async function storeRenderedEvidence(
  storage: Storage,
  document: RenderedDocument,
  extracted: ExtractionResult,
  fetchedAt: Date,
  context?: CallContext,
): Promise<void> {
  const body = await storage.blobs.put(document.markdown);
  await storage.cache.put({
    url: document.url,
    body,
    contentClass: "general",
    bodyKind: "rendered",
    fetchedAt,
    mainContent: extracted.passages.map((passage) => passage.text).join("\n"),
    headers: originHeaders(document),
  });
  // CACHE-006 caps the store at a configured ceiling. Eviction existed but no
  // product path drove it, so the limit was never enforced at runtime and the
  // cache could grow without bound.
  await storage.cache.evict(context?.configuration.configuration?.cache.max_bytes);
}

/**
 * Rebuilds the origin's cache-relevant headers. Freshness and revalidation
 * follow these; without them the cache can only apply a content-class TTL, and
 * a `no-store` page would be written down despite forbidding it.
 */
function originHeaders(document: RenderedDocument): Headers {
  const headers = new Headers(document.cacheHeaders ?? {});
  if (document.contentType !== undefined) headers.set("content-type", document.contentType);
  return headers;
}
