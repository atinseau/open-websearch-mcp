import { inspectCodexProbe, sanitizeJsonl } from "./contract.ts";
import { probePolicyDocument } from "./capture-probe-policy.ts";
import { scheduleMalformedArchive } from "./capture-probe-malformed.ts";
import { executeProbe } from "./capture-probe-execute.ts";
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
  let sanitizedEvents: string;
  // Every failure path archives the same way: sanitized events plus a policy
  // document under a failure-stamped output. Only the policy differs, so the
  // shared archival is stated once here instead of at each rejection.
  const scheduleFailureArchive = (policyDocument: Record<string, unknown>): string => {
    const archivedOutput = failureOutput(target, startedAt);
    schedulePublication(async () => {
      await withRefreshMutation(root, date, async () => {
        await writeCaptureArtifacts(archivedOutput, sanitizedEvents, policyDocument);
      });
    });
    return archivedOutput;
  };
  try {
    sanitizedEvents = sanitizeJsonl(stdout, paths);
  } catch (error) {
    scheduleMalformedArchive({
      target,
      root,
      date,
      stdout,
      error,
      observation,
      schedulePublication,
    });
    throw error;
  }
  let events: unknown[];
  let inspection: CaptureInspection;
  try {
    events = sanitizedEvents
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    inspection = inspectCodexProbe(events);
  } catch (error) {
    scheduleFailureArchive(
      probePolicyDocument(observation, {
        failure: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
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
    scheduleFailureArchive({ ...policy, failure });
    throw error;
  }

  if (!accepted) {
    const archivedOutput = failureOutput(target, startedAt);
    schedulePublication(async () => {
      await withRefreshMutation(root, date, async () => {
        await writeCaptureArtifacts(archivedOutput, sanitizedEvents, policy);
      });
      console.log(
        JSON.stringify({
          provider,
          case_id: teacherCase?.id,
          output: archivedOutput,
          exit_code: exitCode,
          inspection,
        }),
      );
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
