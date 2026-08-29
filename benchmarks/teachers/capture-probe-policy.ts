import { sanitizeJsonl } from "./contract.ts";

/** Everything observed about one probe process, before verdict.  */
export type ProbeObservation = {
  provider: string;
  cliVersion: string;
  startedAt: string;
  durationMs: number;
  args: string[];
  cwdContents: string;
  environment: Record<string, string>;
  exitCode: number;
  sanitizedStderr: string;
  processFailure: string | undefined;
  paths: string[];
};

/**
 * Builds the sanitized policy evidence document for one probe. The accepted
 * path carries its inspection; a failure path carries the failure message
 * instead. Both share identical isolation and process evidence, so they are
 * built here once rather than restated per branch.
 */
export function probePolicyDocument(
  observation: ProbeObservation,
  verdict: { inspection: unknown } | { failure: string },
): Record<string, unknown> {
  return JSON.parse(
    sanitizeJsonl(
      JSON.stringify({
        schema_version: 1,
        provider: observation.provider,
        cli_version: observation.cliVersion,
        started_at: observation.startedAt,
        duration_ms: observation.durationMs,
        command: [observation.provider, ...observation.args],
        controls: {
          isolated_temporary_cwd: true,
          cwd_unchanged: observation.cwdContents.length === 0,
          wrapper_shim_bypassed: true,
          session_persistence_disabled: true,
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
        ...verdict,
      }),
      observation.paths,
    ),
  );
}
