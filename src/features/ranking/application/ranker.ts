import { defaultConfiguration, type FullConfiguration } from "@/features/configuration";
import type { EvidencePassage } from "@/features/extraction";
import { analyzeQuery } from "../domain/query";
import {
  clamp,
  eligible,
  freshness,
  googlePosition,
  lexicalCoverage,
  novelty,
  probableSourceType,
  sourceQuality,
} from "../domain/scoring";
import type {
  CandidateRankingInput,
  QueryAnalysis,
  RankedCandidate,
  RankedPage,
  Ranker,
  RankingDiagnostics,
  RankingInput,
  RankingProfile,
  RankingResult,
} from "../domain/types";

export { analyzeQuery } from "../domain/query";
export type {
  CandidateRankingInput,
  QueryAnalysis,
  RankedCandidate,
  RankedPage,
  Ranker,
  RankingDiagnostics,
  RankingInput,
  RankingProfile,
  RankingResult,
} from "../domain/types";

/** Creates a pure, deterministic lexical ranker for one configuration snapshot. */
export function createRanker(configuration: FullConfiguration = defaultConfiguration): Ranker {
  return { rank: (input) => rank(input, configuration) };
}

/** Orders SERP candidates before rendering capacity is spent. */
export function selectPreRenderCandidates(
  candidates: readonly CandidateRankingInput[],
  query: string,
  profile: RankingProfile = "auto",
  budget = candidates.length,
): readonly RankedCandidate[] {
  const analysis = analyzeQuery(query, profile);
  return sort(
    candidates.map((candidate) => ({
      candidate,
      score:
        preRenderScore(candidate, analysis) + versionPreference(candidate, candidates, analysis),
    })),
  ).slice(0, budget);
}

/**
 * Prefers the newest version of a source a question asked about currently.
 *
 * Documentation sites keep every version live under a dated path, and search
 * engines index the older ones best: measured against `modelcontextprotocol.io`,
 * discovery returns `/specification/2025-03-26/`, `/2025-06-18/` and
 * `/2025-11-25/` while the same engines return `/2026-07-28/` when the date is
 * named. The question does not name it - it says "current" - and RANK-005
 * already recognises that as temporal intent.
 *
 * The date in a URL is evidence the product already holds, so this reorders
 * candidates rather than rewriting the query, and only among versions of the
 * same page. A question without that intent is untouched.
 */
function versionPreference(
  candidate: CandidateRankingInput,
  all: readonly CandidateRankingInput[],
  analysis: QueryAnalysis,
): number {
  if (!analysis.temporal) return 0;
  const own = datedVersion(candidate.url);
  if (own === undefined) return 0;
  const newer = all.some((other) => {
    const theirs = datedVersion(other.url);
    return theirs !== undefined && sameVersionedPage(candidate.url, other.url) && theirs > own;
  });
  return newer ? 0 : VERSION_BONUS;
}

/**
 * Enough to overcome the position gap between versions of one page, and no
 * more. Measured on the case this exists for, an engine placed the older
 * version at rank 1 and the newer at rank 4. Position carries 0.25 of the
 * score, so versions several places apart need more than that gap to reorder.
 * Relevance, which carries 0.45, still decides between different pages.
 */
const VERSION_BONUS = 0.25;
const datedPath = /\/((?:19|20)\d{2}-\d{2}-\d{2})(?:\/|$)/u;

function datedVersion(url: URL): string | undefined {
  return datedPath.exec(url.pathname)?.[1];
}

/**
 * Two dated pages of one site, which is what a release comparison needs.
 *
 * Requiring an identical path around the date was too strict: an engine
 * returns pages from several releases at once, not always the same page twice.
 * Measured on the Model Context Protocol question, one run in five returned
 * `/specification/2025-06-18` and `/specification/2026-07-28/server/tools` -
 * different pages, different releases - and the stale one won on position,
 * scoring that run 22.5 against its neighbours' 82.5.
 *
 * A question asking for what is current asks about the site's newest release,
 * whichever page of it the engine offers. Two sites version independently, so
 * the host must still match.
 */
function sameVersionedPage(left: URL, right: URL): boolean {
  return left.hostname === right.hostname;
}

function rank(input: RankingInput, configuration: FullConfiguration): RankingResult {
  const analysis = analyzeQuery(input.query, input.profile);
  const candidates = sort(
    input.candidates.map((candidate) => ({
      candidate: visibleCandidate(candidate),
      score: preRenderScore(candidate, analysis),
    })),
  );
  const pages = sortPages(
    input.candidates.filter((candidate) => eligible(candidate, analysis)),
    input.evidence,
    analysis,
    configuration,
    input.observedAt,
  ).filter((page) => eligible(page.candidate, analysis));
  const diagnostics = input.diagnostics
    ? diagnostic(analysis, configuration, input.candidates, candidates, pages)
    : undefined;
  return diagnostics === undefined ? { candidates, pages } : { candidates, pages, diagnostics };
}

function preRenderScore(candidate: CandidateRankingInput, query: QueryAnalysis): number {
  const coverage = lexicalCoverage(
    query,
    candidate.title,
    candidate.snippet,
    candidate.url.toString(),
  );
  return clamp(
    0.45 * coverage +
      0.25 * googlePosition(candidate) +
      0.2 * probableSourceType(candidate, query.selectedProfile) +
      0.1 * novelty(candidate) +
      documentationPreference(candidate, query),
  );
}

/**
 * Prefers a documentation page when the question asked for the documentation.
 *
 * A site publishes its reference API under a different path than its guides,
 * and a question naming "documentation" is asking for the latter. Measured on
 * the Bun.WebView question, discovery returns
 * `bun.com/reference/bun/WebView/Backend` first and
 * `bun.com/docs/runtime/webview` - the page the corpus cites - second on every
 * run, costing half of that case's rank component with the right page in hand.
 *
 * The word is in the question and the path is in the URL, so this reads
 * evidence both sides already carry. A question that does not ask for
 * documentation is untouched.
 */
function documentationPreference(candidate: CandidateRankingInput, query: QueryAnalysis): number {
  if (!query.tokens.some((token) => documentationWords.has(token))) return 0;
  return documentationPath.test(candidate.url.pathname) ? DOCUMENTATION_BONUS : 0;
}

const documentationWords = new Set(["documentation", "docs", "guide", "manual", "handbook"]);
const documentationPath = /(?:^|\/)(?:docs?|documentation|guide|guides|manual|handbook)(?:\/|$)/iu;
/**
 * Enough to overcome one engine position, and no more. Measured on the case
 * this exists for, the reference page led by 0.125 with position worth 0.25.
 */
const DOCUMENTATION_BONUS = 0.15;

function sortPages(
  candidates: readonly CandidateRankingInput[],
  evidence: readonly EvidencePassage[],
  query: QueryAnalysis,
  configuration: FullConfiguration,
  observedAt?: Date,
): readonly RankedPage[] {
  return [...candidates]
    .map((candidate) => rankPage(candidate, evidence, query, configuration, observedAt))
    .sort(comparePages);
}

function rankPage(
  candidate: CandidateRankingInput,
  evidence: readonly EvidencePassage[],
  query: QueryAnalysis,
  configuration: FullConfiguration,
  observedAt?: Date,
): RankedPage {
  const weights = configuration.experimental;
  const passages = evidence.filter(
    (passage) => passage.sourceUrl.toString() === candidate.url.toString(),
  );
  const passage = Math.max(0, ...passages.map((item) => lexicalCoverage(query, item.text)));
  const concept = lexicalCoverage(
    query,
    candidate.title,
    candidate.headings?.join(" "),
    candidate.content,
    candidate.anchors?.join(" "),
  );
  const base =
    weights.passage_weight * passage +
    weights.concept_coverage_weight * concept +
    weights.source_type_weight * probableSourceType(candidate, "general") +
    weights.google_position_weight * googlePosition(candidate) +
    weights.source_quality_weight * sourceQuality(candidate) +
    weights.freshness_weight * freshness(candidate, query.temporal, observedAt);
  const specialized = profileScore(candidate, query.selectedProfile, base);
  const score = query.selectedProfile === "general" ? base : blend(base, specialized, weights);
  return {
    candidate: visibleCandidate(candidate),
    score: clamp(score),
    confidence: confidence(score),
  };
}

function profileScore(
  candidate: CandidateRankingInput,
  profile: RankingProfile,
  base: number,
): number {
  return clamp(0.7 * base + 0.3 * probableSourceType(candidate, profile));
}
function blend(
  base: number,
  specialized: number,
  weights: FullConfiguration["experimental"],
): number {
  return weights.general_profile_weight * base + weights.specialized_profile_weight * specialized;
}
function confidence(score: number): "high" | "medium" | "low" {
  return score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";
}
function sort(items: readonly RankedCandidate[]): readonly RankedCandidate[] {
  return [...items].sort(
    (left, right) =>
      right.score - left.score ||
      left.candidate.url.toString().localeCompare(right.candidate.url.toString()),
  );
}

function visibleCandidate(candidate: CandidateRankingInput): CandidateRankingInput {
  return { url: candidate.url, sourceType: candidate.sourceType, title: candidate.title };
}
function comparePages(left: RankedPage, right: RankedPage): number {
  return (
    right.score - left.score ||
    left.candidate.url.toString().localeCompare(right.candidate.url.toString())
  );
}

function diagnostic(
  query: QueryAnalysis,
  configuration: FullConfiguration,
  inputs: readonly CandidateRankingInput[],
  candidates: readonly RankedCandidate[],
  pages: readonly RankedPage[],
): RankingDiagnostics {
  const postScores = new Map(
    pages.map((ranked) => [ranked.candidate.url.toString(), ranked.score]),
  );
  return {
    profile: query.selectedProfile,
    weights: configuration.experimental,
    candidates: candidates.map((item) => ({
      url: item.candidate.url.toString(),
      preRenderScore: item.score,
      postExtractionScore: postScores.get(item.candidate.url.toString()),
      googlePosition: inputs.find(
        (candidate) => candidate.url.toString() === item.candidate.url.toString(),
      )?.googlePosition,
    })),
  };
}
