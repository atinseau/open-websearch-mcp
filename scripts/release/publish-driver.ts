/**
 * Executes an authorized release, one step at a time, against injected effects.
 *
 * The driver owns no credentials and knows no registry: publication, tagging,
 * and release creation arrive as effects. That is what lets RELEASE-006's
 * resume requirement be simulated deterministically, and it keeps this file
 * incapable of publishing by accident.
 */
import {
  planRelease,
  type Authorization,
  type LedgerEntry,
  type ReleaseStep,
  type RemoteState,
} from "./publish-ledger.ts";

export interface ReleaseEffects {
  observe(): Promise<RemoteState>;
  publishNpm(authorization: Authorization): Promise<void>;
  createTag(authorization: Authorization): Promise<void>;
  createGithubRelease(authorization: Authorization): Promise<void>;
}

export interface ReleaseOutcome {
  readonly completed: boolean;
  readonly ledger: readonly LedgerEntry[];
  readonly conflict: string | undefined;
  readonly failure: string | undefined;
}

export async function runRelease(input: {
  authorization: Authorization;
  ledger: readonly LedgerEntry[];
  effects: ReleaseEffects;
}): Promise<ReleaseOutcome> {
  const { authorization, effects } = input;
  const ledger = [...input.ledger];
  const remote = await effects.observe();
  const plan = planRelease({ authorization, ledger, remote });
  if (plan.conflict !== undefined)
    return { completed: false, ledger, conflict: plan.conflict, failure: undefined };

  for (const step of plan.steps) {
    try {
      await perform(step, authorization, effects);
    } catch (error) {
      ledger.push(entry(step, "failed", authorization));
      return { completed: false, ledger, conflict: undefined, failure: message(error) };
    }
    ledger.push(entry(step, "succeeded", authorization));
  }
  return { completed: true, ledger, conflict: undefined, failure: undefined };
}

async function perform(
  step: ReleaseStep,
  authorization: Authorization,
  effects: ReleaseEffects,
): Promise<void> {
  if (step === "npm-publish") return effects.publishNpm(authorization);
  if (step === "git-tag") return effects.createTag(authorization);
  return effects.createGithubRelease(authorization);
}

function entry(
  step: ReleaseStep,
  state: "succeeded" | "failed",
  authorization: Authorization,
): LedgerEntry {
  return { step, state, commit: authorization.commit, version: authorization.version };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
