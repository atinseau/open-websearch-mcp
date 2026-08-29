import type { GoogleDiscoveryService } from "@/features/discovery";
import type { LocalSearchResult } from "@/features/storage";
import { selectPreRenderCandidates } from "@/features/ranking";
import type { CallContext, WebSearchInput } from "../index.ts";

type Discovered = Awaited<ReturnType<GoogleDiscoveryService["discover"]>>;

function budget(context: CallContext): number {
  return context.configuration.configuration?.search.candidate_budget ?? 30;
}

/** Presents a stored page as a search candidate. */
function fromCache(item: LocalSearchResult["results"][number]) {
  return {
    url: item.document.url,
    sourceType: "local_cache" as const,
    title: item.document.url.hostname,
  };
}

/**
 * Orders stored evidence alone. Used when discovery is unavailable, so a
 * blocked search still answers from what the product already fetched.
 */
export function cachedCandidates(
  cached: LocalSearchResult,
  input: WebSearchInput,
  context: CallContext,
) {
  return selectPreRenderCandidates(
    cached.results.map((item, index) => ({ ...fromCache(item), googlePosition: index + 1 })),
    input.query,
    input.profile,
    budget(context),
  );
}

/**
 * Orders discovered and stored candidates together. A discovered URL already
 * held locally is dropped in favour of its cached entry, so one page is not
 * offered twice under two provenances.
 */
export function mergedCandidates(
  discovered: Discovered,
  cached: LocalSearchResult,
  input: WebSearchInput,
  context: CallContext,
) {
  const cachedUrls = new Set(cached.results.map((item) => item.document.url.href));
  return selectPreRenderCandidates(
    [
      ...discovered.candidates.filter((candidate) => !cachedUrls.has(candidate.url.href)),
      ...cached.results.map((item) => fromCache(item)),
    ].map((candidate, index) => ({ ...candidate, googlePosition: index + 1 })),
    input.query,
    input.profile,
    budget(context),
  );
}
