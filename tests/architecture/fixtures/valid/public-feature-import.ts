import type { Candidate } from "@/features/discovery";

export type RankedCandidate = Candidate & { score: number };
