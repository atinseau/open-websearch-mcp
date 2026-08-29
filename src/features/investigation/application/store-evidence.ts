import type { ExtractionResult } from "@/features/extraction";
import type { RenderedDocument } from "@/features/rendering";
import type { Storage } from "@/features/storage";

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
): Promise<void> {
  const body = await storage.blobs.put(document.markdown);
  await storage.cache.put({
    url: document.url,
    body,
    contentClass: "general",
    bodyKind: "rendered",
    fetchedAt,
    mainContent: extracted.passages.map((passage) => passage.text).join("\n"),
    ...(document.contentType === undefined
      ? {}
      : { headers: new Headers({ "content-type": document.contentType }) }),
  });
}
