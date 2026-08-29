import { inspectCodexProbe, sanitizeJsonl } from "./contract.ts";
import { probePolicyDocument, type ProbeObservation } from "./capture-probe-policy.ts";
import { scheduleMalformedArchive } from "./capture-probe-malformed.ts";
import { withRefreshMutation } from "./refresh-lifecycle.ts";
import {
  failureOutput,
  writeCaptureArtifacts,
  type CaptureTarget,
} from "./capture-probe-publication.ts";

type CaptureInspection = ReturnType<typeof inspectCodexProbe>;

/** Sanitized probe output together with what its events prove. */
export type DecodedProbe = {
  sanitizedEvents: string;
  events: unknown[];
  inspection: CaptureInspection;
};

/**
 * Sanitizes and decodes probe stdout into inspected events. Unsanitizable
 * output and undecodable events are different failures with different
 * archives, so each schedules its own before rethrowing.
 */
export function decodeProbeOutput(input: {
  stdout: string;
  observation: ProbeObservation;
  target: CaptureTarget;
  root: string;
  date: string;
  schedulePublication: (publish: () => Promise<void>) => void;
}): DecodedProbe {
  const { stdout, observation, target, root, date, schedulePublication } = input;
  let sanitizedEvents: string;
  try {
    sanitizedEvents = sanitizeJsonl(stdout, observation.paths);
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
  try {
    const events = sanitizedEvents
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { sanitizedEvents, events, inspection: inspectCodexProbe(events) };
  } catch (error) {
    const archivedOutput = failureOutput(target, observation.startedAt);
    const policy = probePolicyDocument(observation, {
      failure: error instanceof Error ? error.message : String(error),
    });
    schedulePublication(async () => {
      await withRefreshMutation(root, date, async () => {
        await writeCaptureArtifacts(archivedOutput, sanitizedEvents, policy);
      });
    });
    throw error;
  }
}
