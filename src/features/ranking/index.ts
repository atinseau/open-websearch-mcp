import type { Candidate } from "@/features/discovery";
import type { EvidencePassage } from "@/features/extraction";

/** Orders candidates deterministically for an investigation. */
export interface Ranker {
  rank(input: RankingInput): readonly Candidate[];
}

export interface RankingInput {
  readonly candidates: readonly Candidate[];
  readonly evidence: readonly EvidencePassage[];
  readonly query: string;
}
