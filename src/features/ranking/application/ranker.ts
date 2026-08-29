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
    candidates.map((candidate) => ({ candidate, score: preRenderScore(candidate, analysis) })),
  ).slice(0, budget);
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
      0.1 * novelty(candidate),
  );
}

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
