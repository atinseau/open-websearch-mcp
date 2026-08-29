import type { Candidate } from "@/features/discovery";
import type { ExtractorRegistry } from "@/features/extraction";
import type { RenderedDocument } from "@/features/rendering";
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
  readonly render: (url: URL, context: CallContext) => Promise<RenderedDocument>;
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
    if (cached?.fresh && cached.document.mainContent)
      return cachedPrepared(candidate, cached.document.mainContent);
    const document = await dependencies.render(candidate.url, context);
    const extracted = await dependencies.extractor.extract(extractionInput(document));
    if (extracted.status !== "success") return undefined;
    await storeRenderedEvidence(dependencies.storage, document, extracted, dependencies.now());
    return { candidate, document, extracted };
  } catch {
    return undefined;
  }
}
