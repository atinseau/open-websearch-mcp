import type { Candidate } from "@/features/discovery";
import type { ExtractorRegistry } from "@/features/extraction";
import type { RenderedDocument, RenderRequest } from "@/features/rendering";
import { decideRobots, type RobotsPolicy } from "@/features/security";
import type { Storage } from "@/features/storage";

import type { CallContext } from "../index.ts";
import type { Prepared } from "./search-preparation.ts";
import { storeRenderedEvidence } from "./store-evidence.ts";
import { cachedPrepared, cacheRead, extractionInput } from "./web-research-result.ts";

export interface CandidatePreparation {
  readonly storage: Storage;
  readonly robots: RobotsPolicy;
  readonly extractor: ExtractorRegistry;
  readonly now: () => Date;
  readonly render: (
    url: URL,
    context: CallContext,
    conditional?: RenderRequest["conditional"],
  ) => Promise<RenderedDocument>;
}

/**
 * Turns one candidate into evidence, or into nothing. A fresh local entry is
 * reused without rendering; anything else is rendered, extracted, and stored so
 * a later search can reuse it. Robots refusal and any failure yield undefined,
 * because a single bad candidate must not end the search.
 */
export async function prepareCandidate(
  dependencies: CandidatePreparation,
  candidate: Candidate,
  context: CallContext,
  focus?: string,
): Promise<Prepared | undefined> {
  const robots = await decideRobots(
    dependencies.robots,
    candidate.url,
    "OpenWebSearchMCP",
    "automatic_search",
  );
  if (!robots.allowed) return undefined;
  try {
    const cached =
      candidate.sourceType === "local_cache"
        ? await dependencies.storage.cache.get(candidate.url, cacheRead(dependencies.now()))
        : undefined;
    const fresh = reusable(candidate, cached, cached?.fresh === true);
    if (fresh) return fresh;
    // A stale entry still holds the origin's validators. Asking whether it is
    // unchanged costs one conditional request; re-rendering costs the whole
    // page and discards evidence the origin would have confirmed.
    const conditional = conditionalFrom(cached);
    const document = await dependencies.render(candidate.url, context, conditional);
    const confirmed = reusable(candidate, cached, document.notModified === true);
    if (confirmed) return confirmed;
    // The query is the focus: without it a long specification returned its
    // opening section whatever the agent had asked about.
    const extracted = await dependencies.extractor.extract(
      // CONFIG-004: how many passages a source may contribute is configuration,
      // not a constant buried in the extractor.
      extractionInput(
        document,
        focus,
        undefined,
        context.configuration.configuration?.output.search_passages_per_source,
      ),
    );
    if (extracted.status !== "success") return undefined;
    await storeRenderedEvidence(
      dependencies.storage,
      document,
      extracted,
      dependencies.now(),
      context,
    );
    return { candidate, document, extracted };
  } catch {
    return undefined;
  }
}

/** Validators a stored copy can offer, or undefined when it has none to give. */
function conditionalFrom(
  cached: { readonly document: { readonly headers?: Headers } } | undefined,
): RenderRequest["conditional"] {
  const etag = cached?.document.headers?.get("etag") ?? undefined;
  const lastModified = cached?.document.headers?.get("last-modified") ?? undefined;
  if (etag === undefined && lastModified === undefined) return undefined;
  return { etag, lastModified };
}

/**
 * The stored copy, when it may stand in for a render: either still fresh, or
 * stale but confirmed unchanged by the origin. Undefined when it cannot.
 */
function reusable(
  candidate: Candidate,
  cached: { readonly document: { readonly mainContent?: string } } | undefined,
  usable: boolean,
): Prepared | undefined {
  const content = cached?.document.mainContent;
  return usable && content ? cachedPrepared(candidate, content) : undefined;
}
