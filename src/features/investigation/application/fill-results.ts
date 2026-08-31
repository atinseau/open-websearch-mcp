import type { Candidate } from "@/features/discovery";

import type { CallContext } from "../index.ts";
import { startPreparation, type Prepared } from "./search-preparation.ts";

export interface RankedCandidate {
  readonly candidate: Candidate;
  readonly score: number;
}

/**
 * Fills a result quota from ranked candidates, best candidate first.
 *
 * Every candidate is prepared concurrently, but a page is only taken once no
 * better-scoring candidate is still in flight. Taking them purely by arrival
 * made the quota a race, and that race is biased against the pages a question
 * wants: a specification or reference manual is large and slow, while the
 * aggregators that merely mention it are small and fast. The quota filled with
 * the fast material and the expected source was cancelled before it finished,
 * which is why the same question found a source in one run and missed it in
 * the next.
 *
 * Progressive delivery survives, because nothing waits on a candidate that
 * scored worse than one already settled, and everything still runs at once.
 */
export async function fillFromBestCandidates<Result>(
  candidates: readonly RankedCandidate[],
  wanted: number,
  context: CallContext,
  steps: {
    readonly prepare: (candidate: Candidate, context: CallContext) => Promise<Prepared | undefined>;
    readonly emit: (prepared: Prepared, score: number) => Promise<Result | undefined>;
  },
): Promise<readonly Result[]> {
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const pending = new Map(
    ordered.map((ranked, id) =>
      startPreparation(id, ranked.candidate, ranked.score, context, steps.prepare),
    ),
  );
  const results: Result[] = [];
  // `pending` is ordered best-first, so awaiting its head consumes candidates
  // in score order while every one of them is already being prepared.
  for (const [id, task] of pending) {
    if (results.length >= wanted || context.abortController.signal.aborted) break;
    const settled = await task.promise;
    pending.delete(id);
    if (!settled.prepared) continue;
    const emitted = await steps.emit(settled.prepared, settled.score);
    if (emitted) results.push(emitted);
  }
  for (const task of pending.values()) task.controller.abort(new Error("search_quota_met"));
  return results;
}
