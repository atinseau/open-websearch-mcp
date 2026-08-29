import { sanitizeJsonl } from "./contract.ts";
import { withRefreshMutation } from "./refresh-lifecycle.ts";
import { failureOutput, writeMalformedCapture } from "./capture-probe-publication.ts";
import type { ProbeObservation } from "./capture-probe-policy.ts";
import type { CaptureTarget } from "./capture-probe-publication.ts";

/**
 * Archives a probe whose stdout could not be sanitized into JSONL. Because the
 * events are unusable, the raw stdout is recorded under its own hash and byte
 * count instead, so the malformed run stays auditable without being trusted.
 */
export function scheduleMalformedArchive(input: {
  target: CaptureTarget;
  root: string;
  date: string;
  stdout: string;
  error: unknown;
  observation: ProbeObservation;
  schedulePublication: (publish: () => Promise<void>) => void;
}): void {
  const { target, root, date, stdout, error, observation, schedulePublication } = input;
  const { paths } = observation;
  const archivedOutput = failureOutput(target, observation.startedAt);
  const sanitizedStdout = JSON.parse(sanitizeJsonl(JSON.stringify({ stdout }), paths)).stdout;
  const failure = JSON.parse(
    sanitizeJsonl(
      JSON.stringify({ failure: error instanceof Error ? error.message : String(error) }),
      paths,
    ),
  ).failure;
  schedulePublication(async () => {
    await withRefreshMutation(root, date, async () => {
      await writeMalformedCapture(archivedOutput, {
        schema_version: 1,
        provider: observation.provider,
        cli_version: observation.cliVersion,
        started_at: observation.startedAt,
        duration_ms: observation.durationMs,
        stdout_sha256: new Bun.CryptoHasher("sha256").update(stdout).digest("hex"),
        stdout_bytes: new TextEncoder().encode(stdout).byteLength,
        stdout: sanitizedStdout,
        controls: {
          environment_keys: Object.keys(observation.environment).sort(),
          isolated_account_state: true,
          isolated_config_state: true,
          allowed_child_executables: ["codex-code-mode-host"],
        },
        process: {
          exit_code: observation.exitCode,
          stderr: observation.sanitizedStderr,
          ...(observation.processFailure === undefined
            ? {}
            : { failure: observation.processFailure }),
        },
        failure,
      });
    });
  });
}
