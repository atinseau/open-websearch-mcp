import { sanitizeJsonl } from "./contract.ts";
import { buildTeacherRun } from "./capture-probe-run.ts";
import { withRefreshMutation } from "./refresh-lifecycle.ts";
import type { ProbeObservation } from "./capture-probe-policy.ts";
import {
  failureOutput,
  writeCaptureArtifacts,
  type CaptureTarget,
} from "./capture-probe-publication.ts";

/**
 * Builds the durable run for an accepted case probe. A provider smoke test or
 * a rejected probe has no run, so undefined is the normal result. Assembly
 * failure archives the policy alongside its reason before rethrowing.
 */
export function assembleAcceptedRun(input: {
  teacherCase: { id: string; locale: string; question: string } | undefined;
  accepted: boolean;
  provider: "codex";
  events: unknown[];
  date: string;
  observation: ProbeObservation;
  cliVersion: string;
  prompt: string;
  inspection: { forbidden_tool_calls: unknown };
  policy: Record<string, unknown>;
  sanitizedEvents: string;
  target: CaptureTarget;
  root: string;
  schedulePublication: (publish: () => Promise<void>) => void;
}): unknown {
  const { teacherCase, accepted, provider, events, date, observation } = input;
  const { cliVersion, prompt, inspection, policy, sanitizedEvents } = input;
  const { target, root, schedulePublication } = input;
  if (teacherCase === undefined || !accepted) return undefined;
  try {
    return buildTeacherRun({
      teacherCase,
      provider,
      events,
      date,
      cliVersion,
      startedAt: observation.startedAt,
      durationMs: observation.durationMs,
      prompt,
      cwdUnchanged: observation.cwdContents.length === 0,
      forbiddenToolCalls: inspection.forbidden_tool_calls,
    });
  } catch (error) {
    const failure = JSON.parse(
      sanitizeJsonl(
        JSON.stringify({ failure: error instanceof Error ? error.message : String(error) }),
        observation.paths,
      ),
    ).failure;
    const archivedOutput = failureOutput(target, observation.startedAt);
    schedulePublication(async () => {
      await withRefreshMutation(root, date, async () => {
        await writeCaptureArtifacts(archivedOutput, sanitizedEvents, { ...policy, failure });
      });
    });
    throw error;
  }
}
