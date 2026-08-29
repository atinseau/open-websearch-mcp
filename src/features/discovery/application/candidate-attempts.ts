import type { Candidate } from "@/features/discovery";

export type CandidateAttemptStatus =
  | "success"
  | "blocked"
  | "network_error"
  | "timeout"
  | "target_error";
export interface CandidateAttempt<Result> {
  readonly status: CandidateAttemptStatus;
  readonly value?: Result;
}
export interface CandidateAttemptResult<Result> {
  readonly candidate: Candidate;
  readonly attempt: CandidateAttempt<Result>;
}

/** Applies the bounded retry and per-call host circuit policy to selected candidates. */
export async function analyzeCandidates<Result>(
  candidates: readonly Candidate[],
  budget: number,
  analyze: (candidate: Candidate, shortTimeout: boolean) => Promise<CandidateAttempt<Result>>,
): Promise<readonly CandidateAttemptResult<Result>[]> {
  const circuits = new Map<string, number>();
  const results: CandidateAttemptResult<Result>[] = [];
  for (const candidate of candidates.slice(0, Math.min(30, budget))) {
    if ((circuits.get(candidate.url.hostname) ?? 0) >= 2) continue;
    const attempt = await retryCandidate(candidate, analyze);
    if (attempt.status === "blocked")
      circuits.set(candidate.url.hostname, (circuits.get(candidate.url.hostname) ?? 0) + 1);
    results.push({ candidate, attempt });
  }
  return results;
}

async function retryCandidate<Result>(
  candidate: Candidate,
  analyze: (candidate: Candidate, shortTimeout: boolean) => Promise<CandidateAttempt<Result>>,
): Promise<CandidateAttempt<Result>> {
  const initial = await analyze(candidate, false);
  if (initial.status === "network_error" || initial.status === "target_error")
    return await analyze(candidate, false);
  if (initial.status === "timeout") return await analyze(candidate, true);
  return initial;
}
