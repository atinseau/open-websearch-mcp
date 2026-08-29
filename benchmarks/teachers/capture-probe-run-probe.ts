import { inspectCodexProbe, sanitizeJsonl } from "./contract.ts";
import { probePolicyDocument } from "./capture-probe-policy.ts";
import { executeProbe } from "./capture-probe-execute.ts";
import { scheduleRejectedArchive } from "./capture-probe-rejected.ts";
import { decodeProbeOutput } from "./capture-probe-decode.ts";
import { buildTeacherRun } from "./capture-probe-run.ts";
import type { ProbePlan } from "./capture-probe-plan.ts";
import { withRefreshMutation } from "./refresh-lifecycle.ts";
import { failureOutput, writeCaptureArtifacts } from "./capture-probe-publication.ts";

type CaptureInspection = ReturnType<typeof inspectCodexProbe>;

/** The artifacts of a probe the policy inspection accepted. */
export type AcceptedCapture = {
  sanitizedEvents: string;
  policy: Record<string, unknown>;
  run: unknown;
  startedAt: string;
  exitCode: number;
  inspection: CaptureInspection;
};

/**
 * Runs one planned probe and returns its accepted artifacts. Every rejection
 * schedules its own archival and rethrows, so the caller publishes exactly one
 * outcome: the scheduled failure archive, or the accepted capture.
 */
export async function runPlannedProbe(input: {
  plan: ProbePlan;
  provider: "codex";
  date: string;
  schedulePublication: (publish: () => Promise<void>) => void;
}): Promise<AcceptedCapture> {
  const { plan, provider, date, schedulePublication } = input;
  const { root, target, teacherCase, cliVersion } = plan;
  const { stdout, prompt: commonPrompt, observation } = await executeProbe({ plan, provider });
  const { startedAt, durationMs, cwdContents, exitCode, paths, processFailure } = observation;
  const { sanitizedEvents, events, inspection } = decodeProbeOutput({
    stdout,
    observation,
    target,
    root,
    date,
    schedulePublication,
  });
  const accepted = inspection.accepted && exitCode === 0 && processFailure === undefined;
  const policy = probePolicyDocument(observation, { inspection });
  let run: unknown;
  try {
    if (teacherCase !== undefined && accepted) {
      run = buildTeacherRun({
        teacherCase,
        provider,
        events,
        date,
        cliVersion,
        startedAt,
        durationMs,
        prompt: commonPrompt,
        cwdUnchanged: cwdContents.length === 0,
        forbiddenToolCalls: inspection.forbidden_tool_calls,
      });
    }
  } catch (error) {
    const failure = JSON.parse(
      sanitizeJsonl(
        JSON.stringify({
          failure: error instanceof Error ? error.message : String(error),
        }),
        paths,
      ),
    ).failure;
    const archivedOutput = failureOutput(target, startedAt);
    schedulePublication(async () => {
      await withRefreshMutation(root, date, async () => {
        await writeCaptureArtifacts(archivedOutput, sanitizedEvents, { ...policy, failure });
      });
    });
    throw error;
  }

  if (!accepted) {
    scheduleRejectedArchive({
      target,
      root,
      date,
      provider,
      caseId: teacherCase?.id,
      startedAt,
      exitCode,
      inspection,
      sanitizedEvents,
      policy,
      schedulePublication,
    });
    throw new Error(`${provider} policy or run failed`);
  }
  return {
    sanitizedEvents,
    policy,
    run,
    startedAt,
    exitCode,
    inspection,
  };
}
