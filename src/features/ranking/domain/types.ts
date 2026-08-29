import type { FullConfiguration } from "@/features/configuration";
import type { Candidate } from "@/features/discovery";
import type { EvidencePassage } from "@/features/extraction";

export type RankingProfile = "auto" | "general" | "technical" | "news" | "academic" | "community";

export interface CandidateRankingInput extends Candidate {
  readonly snippet?: string;
  readonly googlePosition?: number;
  readonly isNovel?: boolean;
  readonly publishedAt?: Date;
  readonly headings?: readonly string[];
  readonly content?: string;
  readonly anchors?: readonly string[];
  readonly hasAuthor?: boolean;
  readonly hasCitations?: boolean;
  readonly originalProvenance?: boolean;
  readonly boilerplateRatio?: number;
  readonly duplicate?: boolean;
  readonly extractable?: boolean;
  readonly supported?: boolean;
}

export interface QueryAnalysis {
  readonly tokens: readonly string[];
  readonly quotedPhrases: readonly string[];
  readonly temporal: boolean;
  readonly selectedProfile: Exclude<RankingProfile, "auto">;
}

export interface RankedCandidate {
  /** Public candidate identity only; scoring inputs remain internal. */
  readonly candidate: Candidate;
  readonly score: number;
}

export interface RankedPage extends RankedCandidate {
  readonly confidence: "high" | "medium" | "low";
}

export interface RankingDiagnostics {
  readonly profile: Exclude<RankingProfile, "auto">;
  readonly weights: Readonly<FullConfiguration["experimental"]>;
  readonly candidates: readonly {
    readonly url: string;
    readonly preRenderScore: number;
    readonly postExtractionScore?: number;
    readonly googlePosition?: number;
  }[];
}

export interface RankingInput {
  readonly candidates: readonly CandidateRankingInput[];
  readonly evidence: readonly EvidencePassage[];
  readonly query: string;
  readonly profile?: RankingProfile;
  readonly diagnostics?: boolean;
  /** Call-start time captured by the application layer for deterministic freshness. */
  readonly observedAt?: Date;
}

export interface RankingResult {
  readonly candidates: readonly RankedCandidate[];
  readonly pages: readonly RankedPage[];
  readonly diagnostics?: RankingDiagnostics;
}

export interface Ranker {
  rank(input: RankingInput): RankingResult;
}
