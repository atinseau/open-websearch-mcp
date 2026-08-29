import { inspectCodexProbe } from "./contract.ts";
import { probePolicyDocument } from "./capture-probe-policy.ts";
import { executeProbe } from "./capture-probe-execute.ts";
import { scheduleRejectedArchive } from "./capture-probe-rejected.ts";
import { decodeProbeOutput } from "./capture-probe-decode.ts";
import { assembleAcceptedRun } from "./capture-probe-assemble.ts";
import type { ProbePlan } from "./capture-probe-plan.ts";

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
type PlannedProbeInput = {
  plan: ProbePlan;
  provider: "codex";
  date: string;
  schedulePublication: (publish: () => Promise<void>) => void;
};

export async function runPlannedProbe(input: PlannedProbeInput): Promise<AcceptedCapture> {
  const { plan, provider, date, schedulePublication } = input;
  const { root, target, teacherCase, cliVersion } = plan;
  const { stdout, prompt: commonPrompt, observation } = await executeProbe({ plan, provider });
  const { startedAt, exitCode, processFailure } = observation;
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
  const run = assembleAcceptedRun({
    teacherCase,
    accepted,
    provider,
    events,
    date,
    observation,
    cliVersion,
    prompt: commonPrompt,
    inspection,
    policy,
    sanitizedEvents,
    target,
    root,
    schedulePublication,
  });

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
