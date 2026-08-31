import type { RenderView } from "@/features/rendering";

export /**
 * Closing a view is cleanup, and cleanup must never become the answer. Chrome
 * rejects a close on a target it has already dropped, and that rejection used
 * to escape the `finally` block: it replaced the document a navigation had
 * already rendered and returned, and it masked the real cause when a
 * navigation had genuinely failed. Either way the caller was told something
 * untrue about the page.
 */
function closeQuietly(view: RenderView): void {
  try {
    // Chrome answers a close on a target it already dropped both ways: some
    // closes throw here, others reject a promise the typed signature does not
    // admit. Both are cleanup failures, and neither is the caller's business.
    const closing: unknown = view.close();
    if (closing instanceof Promise) closing.catch(() => {});
  } catch {}
}
