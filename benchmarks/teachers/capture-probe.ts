import {
  inspectCodexProbe,
  normalizeTeacherRun,
  sanitizeJsonl,
  teacherCases,
  validateTeacherRun,
} from "./contract.ts";
import { requiredDate } from "./contract-json.ts";
import { assertRefreshWritable, withRefreshMutation } from "./refresh-lifecycle.ts";
import { ensureRefreshInputs } from "./refresh-inputs.ts";
import { codexDisabledArgs, codexSkillArgs } from "./policy-controls.ts";
import { canonicalExecutable, commandOutput, runProcess } from "./process-controls.ts";
import {
  cleanupBeforePublication,
  isolatedTeacherHome,
  teacherProcessEnvironment,
} from "./derive-fixture-support.ts";

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
  const eventsPath = `${output}/events.sanitized.jsonl`;
  const policyPath = `${output}/policy.json`;
  const runPath = `${output}/run.json`;
  if (await outputExists()) {
    throw new Error(`immutable probe already exists: ${output}`);
  }

  function failedOutputPath(capturedCaseId: string | undefined, captureStartedAt: string): string {
    const timestamp = captureStartedAt.replaceAll(/[-:.]/g, "");
    return `${root}/runs/${date}/failures/${capturedCaseId ?? "probe"}/${provider}-policy-${timestamp}`;
  }

  async function outputExists(): Promise<boolean> {
    return (
      (await Bun.file(eventsPath).exists()) ||
      (await Bun.file(policyPath).exists()) ||
      (await Bun.file(runPath).exists())
    );
  }

  async function writeCaptureArtifacts(
    directory: string,
    events: string,
    policy: unknown,
    run?: unknown,
  ): Promise<void> {
    await publishArtifacts(directory, {
      "events.sanitized.jsonl": `${events}\n`,
      "policy.json": `${JSON.stringify(policy, null, 2)}\n`,
      ...(run === undefined ? {} : { "run.json": `${JSON.stringify(run, null, 2)}\n` }),
    });
  }

  async function writeMalformedCapture(directory: string, result: unknown): Promise<void> {
    await publishArtifacts(directory, {
      "result.sanitized.json": `${JSON.stringify(result, null, 2)}\n`,
    });
  }

  async function publishArtifacts(directory: string, files: Record<string, string>): Promise<void> {
    const temporary = `${directory}.tmp-${crypto.randomUUID()}`;
    try {
      await commandOutput(["/bin/mkdir", "-p", temporary]);
      for (const [name, contents] of Object.entries(files)) {
        await Bun.write(`${temporary}/${name}`, contents);
      }
      const exists = await runProcess(["/bin/test", "-e", directory], {
        timeoutMs: 30_000,
        maxOutputBytes: 1_048_576,
      });
      if (exists.exit_code === 0 && exists.failure === undefined)
        throw new Error(`immutable probe already exists: ${directory}`);
      await commandOutput(["/bin/mv", temporary, directory]);
    } finally {
      await commandOutput(["/bin/rm", "-rf", temporary]);
    }
  }

  async function publishAcceptedCapture(capture: AcceptedCapture): Promise<void> {
    let archivedOutput = output;
    let collision = false;
    await withRefreshMutation(root, date, async () => {
      if (await outputExists()) {
        collision = true;
        archivedOutput = failedOutputPath(teacherCase?.id, capture.startedAt);
        await writeCaptureArtifacts(archivedOutput, capture.sanitizedEvents, {
          ...capture.policy,
          failure: `immutable probe already exists: ${output}`,
        });
        return;
      }
      await writeCaptureArtifacts(output, capture.sanitizedEvents, capture.policy, capture.run);
    });
    if (collision) {
      throw new Error(
        `immutable probe already exists: ${output}; attempt archived at ${archivedOutput}`,
      );
    }
    console.log(
      JSON.stringify({
        provider,
        case_id: teacherCase?.id,
        output: archivedOutput,
        exit_code: capture.exitCode,
        inspection: capture.inspection,
      }),
    );
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
    const cwd = `${temporaryRoot}/cwd`;
    const isolatedHome = isolatedTeacherHome(temporaryRoot);
    const isolatedConfig = `${temporaryRoot}/config`;
    await commandOutput(["/bin/mkdir", "-m", "700", cwd, isolatedHome, isolatedConfig]);

    const commonPrompt =
      teacherCase === undefined
        ? "Use native Web Search to identify the latest stable Bun release. Cite every factual claim with source URLs. Do not use local files or any non-Web tool."
        : refreshInputs.prompt.replace("{{question}}", teacherCase.question);

    const environment = teacherProcessEnvironment(isolatedHome, { CODEX_HOME: isolatedConfig });
    const sourceHome = Bun.env.CODEX_HOME ?? `${Bun.env.HOME}/.codex`;
    const sourceAuth = `${sourceHome}/auth.json`;
    if (!(await Bun.file(sourceAuth).exists())) throw new Error("Codex auth.json is missing");
    await commandOutput([
      "/usr/bin/install",
      "-m",
      "600",
      sourceAuth,
      `${isolatedConfig}/auth.json`,
    ]);
    const args = [
      "exec",
      ...(teacherCase === undefined ? [] : ["--model", "gpt-5.4"]),
      "--cd",
      cwd,
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "--sandbox",
      "read-only",
      "--json",
      "--color",
      "never",
      "-c",
      'approval_policy="never"',
      "-c",
      'web_search="live"',
      "-c",
      'history.persistence="none"',
      "-c",
      "project_doc_max_bytes=0",
      ...codexSkillArgs(),
      ...codexDisabledArgs(),
      commonPrompt,
    ];

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
    let sanitizedEvents: string;
    try {
      sanitizedEvents = sanitizeJsonl(stdout, paths);
    } catch (error) {
      const archivedOutput = failedOutputPath(teacherCase?.id, startedAt);
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
      const archivedOutput = failedOutputPath(teacherCase?.id, startedAt);
      const failurePolicy = JSON.parse(
        sanitizeJsonl(
          JSON.stringify({
            schema_version: 1,
            provider,
            cli_version: cliVersion,
            started_at: startedAt,
            duration_ms: durationMs,
            command: [provider, ...args],
            controls: {
              isolated_temporary_cwd: true,
              cwd_unchanged: cwdContents.length === 0,
              wrapper_shim_bypassed: true,
              session_persistence_disabled: true,
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
            failure: error instanceof Error ? error.message : String(error),
          }),
          paths,
        ),
      );
      pendingPublication = async () => {
        await withRefreshMutation(root, date, async () => {
          await writeCaptureArtifacts(archivedOutput, sanitizedEvents, failurePolicy);
        });
      };
      throw error;
    }
    const accepted = inspection.accepted && exitCode === 0 && result.failure === undefined;
    const policy = JSON.parse(
      sanitizeJsonl(
        JSON.stringify({
          schema_version: 1,
          provider,
          cli_version: cliVersion,
          started_at: startedAt,
          duration_ms: durationMs,
          command: [provider, ...args],
          controls: {
            isolated_temporary_cwd: true,
            cwd_unchanged: cwdContents.length === 0,
            wrapper_shim_bypassed: true,
            session_persistence_disabled: true,
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
          inspection,
        }),
        paths,
      ),
    );
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
      const archivedOutput = failedOutputPath(teacherCase?.id, startedAt);
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
          await writeCaptureArtifacts(archivedOutput, sanitizedEvents, {
            ...policy,
            failure,
          });
        });
      };
      throw error;
    }

    if (!accepted) {
      const archivedOutput = failedOutputPath(teacherCase?.id, startedAt);
      pendingPublication = async () => {
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
      if (capture !== undefined) await publishAcceptedCapture(capture);
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
