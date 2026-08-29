/**
 * The search pipeline: order candidates, prepare one, render a destination, and
 * store what was rendered. Grouped so the application reads as one seam rather
 * than four adjacent imports.
 */
export { cachedCandidates, mergedCandidates } from "./search-candidates.ts";
export { prepareCandidate } from "./prepare-candidate.ts";
export { renderDestination } from "./render-destination.ts";
export { storeRenderedEvidence } from "./store-evidence.ts";
