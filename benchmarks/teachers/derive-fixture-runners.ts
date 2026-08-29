import { sanitizeJsonl } from "./contract.ts";
import { normalizeDraftEvidence, validateDraftEvidence } from "./fixture-contract.ts";
import { verifyDraftGrounding } from "./fixture-grounding.ts";
import { codexCodeModeDisabledArgs, codexDisabledArgs, codexSkillArgs } from "./policy-controls.ts";
import {
  commandOutput,
  cleanupBeforePublication,
  createTemporaryPaths,
  derivationPrompt,
  runWithInput,
  teacherProcessEnvironment,
  writeFailure,
  type DerivationContext,
  type ProcessResult,
  type TeacherCase,
  type TemporaryPaths,
} from "./derive-fixture-support.ts";

type DraftArtifacts = {
  context: DerivationContext;
  evidence: unknown;
  output: string;
  args: string[];
  startedAt: string;
  result: ProcessResult;
  paths: string[];
  environmentKeys: string[];
  draft: unknown;
};

export async function deriveDraft(
  context: DerivationContext,
  teacherCase: TeacherCase,
  evidence: unknown,
  output: string,
): Promise<unknown> {
  const paths = await createTemporaryPaths(`derive-${teacherCase.id}`);
  let pendingFailure: (() => Promise<void>) | undefined;
  try {
    await installCodexAuth(context, paths);
    const schemaPath = `${paths.root}/draft.schema.json`;
    const responsePath = `${paths.root}/draft.json`;
    await Bun.write(schemaPath, context.draftSchema);
    const args = codexArgs(paths, schemaPath, responsePath);
    const startedAt = new Date().toISOString();
    const environment = teacherProcessEnvironment(paths.home, { CODEX_HOME: paths.config });
    const result = await runWithInput(
      [context.codex, ...args],
      derivationPrompt(teacherCase, evidence),
      { cwd: paths.cwd, env: environment },
    );
    const sensitivePaths = [paths.root, Bun.env.HOME ?? ""];
    if (
      result.exit_code !== 0 ||
      result.failure !== undefined ||
      !(await Bun.file(responsePath).exists())
    ) {
      pendingFailure = async () => {
        await writeFailure(context, teacherCase, "codex", result, sensitivePaths);
      };
      throw new Error(
        `Codex fixture derivation failed for ${teacherCase.id}: ${result.failure ?? result.stderr}`,
      );
    }
    try {
      const draft = normalizeDraftEvidence(
        evidence,
        JSON.parse(await Bun.file(responsePath).text()),
      );
      validateDraftEvidence(evidence, draft);
      await persistDraft({
        context,
        evidence,
        output,
        args,
        startedAt,
        result,
        paths: sensitivePaths,
        environmentKeys: Object.keys(environment).sort(),
        draft,
      });
      return draft;
    } catch (error) {
      pendingFailure = async () => {
        await writeFailure(context, teacherCase, "codex", result, sensitivePaths);
      };
      throw new Error(`Codex returned an invalid fixture draft for ${teacherCase.id}`, {
        cause: error,
      });
    }
  } finally {
    await cleanupBeforePublication(paths.root, async () => {
      const publishFailure = pendingFailure;
      if (publishFailure !== undefined) await publishFailure();
    });
  }
}

async function installCodexAuth(context: DerivationContext, paths: TemporaryPaths): Promise<void> {
  const sourceHome = Bun.env.CODEX_HOME ?? `${Bun.env.HOME}/.codex`;
  const sourceAuth = `${sourceHome}/auth.json`;
  if (!(await Bun.file(sourceAuth).exists())) throw new Error("Codex auth.json is missing");
  await commandOutput(["/usr/bin/install", "-m", "600", sourceAuth, `${paths.config}/auth.json`]);
}

function codexArgs(paths: TemporaryPaths, schemaPath: string, responsePath: string): string[] {
  return [
    "exec",
    "--model",
    "gpt-5.4",
    "--cd",
    paths.cwd,
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
    "--output-schema",
    schemaPath,
    "--output-last-message",
    responsePath,
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
    "-c",
    'history.persistence="none"',
    "-c",
    "project_doc_max_bytes=0",
    ...codexSkillArgs(),
    ...codexCodeModeDisabledArgs(),
    ...codexDisabledArgs(),
    "-",
  ];
}

async function persistDraft(artifacts: DraftArtifacts): Promise<void> {
  const { context, evidence, output, args, startedAt, result, paths, environmentKeys, draft } =
    artifacts;
  const policy = sanitizeJsonl(
    JSON.stringify({
      schema_version: 1,
      provider: "codex",
      model: "gpt-5.4",
      cli_version: context.codexVersion,
      started_at: startedAt,
      duration_ms: result.duration_ms,
      command: ["codex", ...args],
      controls: {
        isolated_temporary_cwd: true,
        wrapper_shim_bypassed: true,
        session_persistence_disabled: true,
        tools_disabled: true,
        skills_disabled: true,
        environment_keys: environmentKeys,
        isolated_account_state: true,
      },
      process: {
        exit_code: result.exit_code,
        stderr: result.stderr,
        ...(result.failure === undefined ? {} : { failure: result.failure }),
      },
    }),
    paths,
  );
  await commandOutput(["/bin/mkdir", "-p", output]);
  await writeArtifact(`${output}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await writeArtifact(
    `${output}/codex-events.sanitized.jsonl`,
    `${sanitizeJsonl(result.stdout, paths)}\n`,
  );
  await writeArtifact(
    `${output}/derivation-policy.json`,
    `${JSON.stringify(JSON.parse(policy), null, 2)}\n`,
  );
  await writeArtifact(`${output}/draft.json`, `${JSON.stringify(draft, null, 2)}\n`);
}

/**
 * Deterministic replacement for the removed Claude verification subprocess
 * (ADR-0006). Runs in-process, has no provider, credential, or network
 * dependency, and archives its result so audits can recompute it exactly.
 */
export async function verifyDraft(
  _context: DerivationContext,
  _teacherCase: TeacherCase,
  evidence: unknown,
  draft: unknown,
  output: string,
): Promise<unknown> {
  const verification = verifyDraftGrounding(evidence, draft);
  await writeArtifact(
    `${output}/verification-policy.json`,
    `${JSON.stringify(
      {
        schema_version: 1,
        verifier: "grounding",
        deterministic: true,
        uses_llm: false,
        uses_network: false,
        accepted: verification.accepted_claim_ids.length,
        rejected: verification.rejected_claims.length,
      },
      null,
      2,
    )}\n`,
  );
  await writeArtifact(`${output}/verification.json`, `${JSON.stringify(verification, null, 2)}\n`);
  return verification;
}

async function writeArtifact(path: string, contents: string): Promise<void> {
  const temporary = `${path}.tmp-${crypto.randomUUID()}`;
  try {
    await Bun.write(temporary, contents);
    await commandOutput(["/bin/mv", temporary, path]);
  } finally {
    if (await Bun.file(temporary).exists()) await Bun.file(temporary).delete();
  }
}
