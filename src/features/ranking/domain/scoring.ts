import type { CandidateRankingInput, QueryAnalysis, RankingProfile } from "./types";

export function lexicalCoverage(
  query: QueryAnalysis,
  ...fields: readonly (string | undefined)[]
): number {
  const corpus = fields.filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
  const units = [...query.tokens, ...query.quotedPhrases];
  if (units.length === 0) return 0;
  return units.filter((unit) => corpus.includes(unit)).length / units.length;
}

export function googlePosition(candidate: CandidateRankingInput): number {
  const position = candidate.googlePosition;
  return position !== undefined && position > 0 ? 1 / position : 0.5;
}

export function probableSourceType(
  candidate: CandidateRankingInput,
  profile: RankingProfile,
): number {
  if (profile === "general" || profile === "auto")
    return candidate.sourceType === "organic" ? 1 : 0.65;
  const expected: Record<Exclude<RankingProfile, "auto" | "general">, readonly string[]> = {
    technical: ["document", "organic"],
    news: ["news"],
    academic: ["academic", "document"],
    community: ["discussion"],
  };
  return expected[profile].includes(candidate.sourceType) ? 1 : 0.4;
}

export function novelty(candidate: CandidateRankingInput): number {
  return candidate.isNovel === false ? 0 : 1;
}

export function sourceQuality(candidate: CandidateRankingInput): number {
  const contentLength = candidate.content?.trim().length ?? 0;
  const substantial = contentLength >= 800 ? 1 : contentLength >= 200 ? 0.6 : 0.25;
  const positives =
    Number(Boolean(candidate.hasAuthor)) +
    Number(Boolean(candidate.hasCitations)) +
    Number(Boolean(candidate.originalProvenance));
  const headings = Math.min((candidate.headings?.length ?? 0) / 4, 1);
  const boilerplate = Math.min(Math.max(candidate.boilerplateRatio ?? 0, 0), 1);
  return clamp(0.45 * substantial + 0.2 * headings + 0.35 * (positives / 3) - 0.3 * boilerplate);
}

export function freshness(
  candidate: CandidateRankingInput,
  temporal: boolean,
  observedAt?: Date,
): number {
  if (!temporal || candidate.publishedAt === undefined || observedAt === undefined) return 0.5;
  const ageDays = Math.max(
    0,
    (observedAt.getTime() - candidate.publishedAt.getTime()) / 86_400_000,
  );
  return clamp(1 - ageDays / 365);
}

export function eligible(candidate: CandidateRankingInput, query: QueryAnalysis): boolean {
  if (
    candidate.extractable === false ||
    candidate.supported === false ||
    candidate.duplicate === true
  )
    return false;
  return (
    lexicalCoverage(
      query,
      candidate.title,
      candidate.headings?.join(" "),
      candidate.content,
      candidate.anchors?.join(" "),
    ) > 0
  );
}

export function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
