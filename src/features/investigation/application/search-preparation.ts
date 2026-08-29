import type { Candidate } from "@/features/discovery";
import type { ExtractionResult } from "@/features/extraction";
import type { RenderedDocument } from "@/features/rendering";

import type { CallContext } from "../index.ts";

export interface Preparation<Value> {
  readonly controller: AbortController;
  readonly promise: Promise<{
    readonly id: number;
    readonly prepared: Value | undefined;
    readonly score: number;
  }>;
}

export interface Prepared {
  readonly candidate: Candidate;
  readonly document: RenderedDocument;
  readonly extracted: ExtractionResult;
}

export function startPreparation<Value>(
  id: number,
  candidate: Candidate,
  score: number,
  context: CallContext,
  prepare: (candidate: Candidate, context: CallContext) => Promise<Value | undefined>,
): readonly [number, Preparation<Value>] {
  const controller = new AbortController();
  const relay = () => controller.abort(context.abortController.signal.reason);
  context.abortController.signal.addEventListener("abort", relay, { once: true });
  const promise = prepare(candidate, { ...context, abortController: controller })
    .then((prepared) => ({ id, prepared, score }))
    .finally(() => context.abortController.signal.removeEventListener("abort", relay));
  return [id, { controller, promise }];
}
