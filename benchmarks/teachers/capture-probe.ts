import {
  inspectCodexProbe,
  normalizeTeacherRun,
  sanitizeJsonl,
  teacherCases,
  validateTeacherRun,
} from "./contract.ts";
import { requiredDate } from "./contract-json.ts";
import { probePolicyDocument } from "./capture-probe-policy.ts";
import { assertRefreshWritable, withRefreshMutation } from "./refresh-lifecycle.ts";
import { ensureRefreshInputs } from "./refresh-inputs.ts";
import { prepareProbeInvocation } from "./capture-probe-invocation.ts";
import { canonicalExecutable, commandOutput, runProcess } from "./process-controls.ts";
import { cleanupBeforePublication } from "./derive-fixture-support.ts";
import {
  captureOutputExists,
  failureOutput,
  publishAcceptedCapture,
  type CaptureTarget,
  writeCaptureArtifacts,
  writeMalformedCapture,
} from "./capture-probe-publication.ts";

type Provider = "codex";
type CaptureInspection = ReturnType<typeof inspectCodexProbe>;
type AcceptedCapture = {
  sanitizedEvents: string;
  policy: Record<string, unknown>;
  run: unknown;
  startedAt: string;
  exitCode: number;
  inspection: CaptureInspection;
};

export async function captureProbe(
  provider: Provider,
  caseId?: string,
  date = Bun.env.TEACHER_REFRESH_DATE ?? new Date().toISOString().slice(0, 10),
): Promise<void> {
  const root = import.meta.dir;
  requiredDate(date, "capture date");
  const refreshInputs = await ensureRefreshInputs(root, date);
  const cases = teacherCases(refreshInputs.corpus);
  const teacherCase = caseId === undefined ? undefined : cases.find((item) => item.id === caseId);
  if (caseId !== undefined && teacherCase === undefined) throw new Error(`unknown case: ${caseId}`);
  await assertRefreshWritable(root, date);
  const output =
    teacherCase === undefined
      ? `${root}/runs/${date}/probes/${provider}`
      : `${root}/runs/${date}/cases/${teacherCase.id}/${provider}`;
  const target: CaptureTarget = { root, date, provider, caseId: teacherCase?.id, output };
  if (await captureOutputExists(target)) {
    throw new Error(`immutable probe already exists: ${output}`);
  }

  const binary = await canonicalExecutable(provider);
  const allowedChildExecutable = await canonicalExecutable("codex-code-mode-host");
  const cliVersion = await commandOutput([binary, "--version"]);
  const temporaryRoot = await commandOutput([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/spk-001-${provider}.XXXXXX`,
  ]);
  let acceptedCapture: AcceptedCapture | undefined;
  let pendingPublication: (() => Promise<void>) | undefined;
  let captureFailure: unknown;
  try {
    const {
      cwd,
      prompt: commonPrompt,
      environment,
      args,
    } = await prepareProbeInvocation({
      temporaryRoot,
      question: teacherCase?.question,
      promptTemplate: refreshInputs.prompt,
      isCase: teacherCase !== undefined,
    });

    const startedAt = new Date().toISOString();
    const result = await runProcess([binary, ...args], {
      cwd,
      env: environment,
      timeoutMs: 900_000,
      maxOutputBytes: 67_108_864,
      allowedChildExecutables: [allowedChildExecutable],
    });
    const { stdout, stderr, exit_code: exitCode, duration_ms: durationMs } = result;
    const cwdContents = await commandOutput(["/bin/ls", "-A", cwd]);
    const paths = [temporaryRoot, Bun.env.HOME ?? ""];
    const sanitizedStderr = JSON.parse(sanitizeJsonl(JSON.stringify({ stderr }), paths)).stderr;
    const observation = {
      provider,
      cliVersion,
      startedAt,
      durationMs,
      args,
      cwdContents,
      environment,
      exitCode,
      sanitizedStderr,
      processFailure: result.failure,
      paths,
    };
    let sanitizedEvents: string;
    // Every failure path archives the same way: sanitized events plus a policy
    // document under a failure-stamped output. Only the policy differs, so the
    // shared archival is stated once here instead of at each rejection.
    const scheduleFailureArchive = (policyDocument: Record<string, unknown>): string => {
      const archivedOutput = failureOutput(target, startedAt);
      pendingPublication = async () => {
        await withRefreshMutation(root, date, async () => {
          await writeCaptureArtifacts(archivedOutput, sanitizedEvents, policyDocument);
        });
      };
      return archivedOutput;
    };
    try {
      sanitizedEvents = sanitizeJsonl(stdout, paths);
    } catch (error) {
      const archivedOutput = failureOutput(target, startedAt);
      const sanitizedStdout = JSON.parse(sanitizeJsonl(JSON.stringify({ stdout }), paths)).stdout;
      const failure = JSON.parse(
        sanitizeJsonl(
          JSON.stringify({
            failure: error instanceof Error ? error.message : String(error),
          }),
          paths,
        ),
      ).failure;
      pendingPublication = async () => {
        await withRefreshMutation(root, date, async () => {
          await writeMalformedCapture(archivedOutput, {
            schema_version: 1,
            provider,
            cli_version: cliVersion,
            started_at: startedAt,
            duration_ms: durationMs,
            stdout_sha256: new Bun.CryptoHasher("sha256").update(stdout).digest("hex"),
            stdout_bytes: new TextEncoder().encode(stdout).byteLength,
            stdout: sanitizedStdout,
            controls: {
              environment_keys: Object.keys(environment).sort(),
              isolated_account_state: true,
              isolated_config_state: true,
              allowed_child_executables: ["codex-code-mode-host"],
            },
            process: {
              exit_code: exitCode,
              stderr: sanitizedStderr,
              ...(result.failure === undefined ? {} : { failure: result.failure }),
            },
            failure,
          });
        });
      };
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
    const accepted = inspection.accepted && exitCode === 0 && result.failure === undefined;
    const policy = probePolicyDocument(observation, { inspection });
    let run: unknown;
    try {
      if (teacherCase !== undefined && accepted) {
        const normalized = normalizeTeacherRun(provider, events, "gpt-5.4");
        const promptSha256 = new Bun.CryptoHasher("sha256").update(commonPrompt).digest("hex");
        run = {
          schema_version: 1,
          run_id: `${date}_${provider}_${teacherCase.id}`,
          case_id: teacherCase.id,
          provider,
          ...normalized,
          cli_version: cliVersion,
          locale: teacherCase.locale,
          started_at: startedAt,
          duration_ms: durationMs,
          prompt_sha256: promptSha256,
          raw_trace: "events.sanitized.jsonl",
          policy_evidence: "policy.json",
          isolation: {
            temporary_cwd: true,
            cwd_unchanged: cwdContents.length === 0,
            forbidden_tool_calls: inspection.forbidden_tool_calls,
          },
        };
        validateTeacherRun(run);
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
      const archivedOutput = scheduleFailureArchive(policy);
      const archiveOnly = pendingPublication;
      pendingPublication = async () => {
        await archiveOnly?.();
        console.log(
          JSON.stringify({
            provider,
            case_id: teacherCase?.id,
            output: archivedOutput,
            exit_code: exitCode,
            inspection,
          }),
        );
      };
      throw new Error(`${provider} policy or run failed`);
    }
    acceptedCapture = {
      sanitizedEvents,
      policy,
      run,
      startedAt,
      exitCode,
      inspection,
    };
  } catch (error) {
    captureFailure = error;
  } finally {
    await cleanupBeforePublication(temporaryRoot, async () => {
      const publishFailure = pendingPublication;
      if (publishFailure !== undefined) {
        await publishFailure();
        return;
      }
      const capture = acceptedCapture;
      if (capture !== undefined) await publishAcceptedCapture(target, capture);
    });
  }
  if (captureFailure !== undefined) throw captureFailure;
  if (acceptedCapture === undefined) throw new Error("accepted capture artifacts are unavailable");
}

if (import.meta.main) {
  const provider = Bun.argv[2];
  if (provider !== "codex") {
    throw new Error("usage: bun capture-probe.ts codex [case-id]");
  }
  await captureProbe(provider, Bun.argv[3]);
}
