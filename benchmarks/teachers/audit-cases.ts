import {
  assertArtifactSanitized,
  assertSanitized,
  createManifest,
  jsonl,
  type Manifest,
} from "./audit-artifacts.ts";
import {
  legacyClaudeDisabledPlugins,
  legacyClaudeIsolationArgs,
  legacyClaudeModel,
} from "./claude-policy-controls.ts";
import {
  assembleFixture,
  assembleLegacyFixture,
  inspectCodexProbe,
  normalizeTeacherRun,
  teacherCases,
  validateFixture,
  validateTeacherRun,
} from "./contract.ts";
import { array, record, requiredDate, requiredString, type JsonRecord } from "./contract-json.ts";
import { assertLegacyArtifactSanitized, assertLegacySanitized } from "./audit-legacy.ts";
import { compactRun } from "./derive-fixture-support.ts";
import {
  normalizeDraftEvidence,
  validateDraftEvidence,
  verificationFromLegacyClaudeEnvelope,
} from "./fixture-contract.ts";
import { verifyDraftGrounding } from "./fixture-grounding.ts";
import { codexDisabledFeatures, codexSkillControls } from "./policy-controls.ts";
import { inspectLegacyClaudeProbe, inspectLegacyCodexProbe } from "./contract-probes.ts";
import { readRefreshInputs } from "./refresh-inputs.ts";
import { assertKnownCaseArtifacts } from "./audit-case-artifacts.ts";

type TeacherCase = { id: string; locale: string; question: string };
type AuditContext = {
  root: string;
  date: string;
  promptTemplate: string;
  legacy: boolean;
};

export async function auditTeacherCorpus(
  root: string,
  date: string,
  verifyManifest = true,
): Promise<{
  eligibility: "conforming" | "historical";
  cases: number;
  runs: number;
  fixtures: number;
  artifacts: number;
}> {
  requiredDate(date, "audit date");
  const refreshInputs = await readAuditInputs(root, date);
  const cases = refreshInputs.legacy
    ? await legacyTeacherCases(root, date)
    : teacherCases(refreshInputs.corpus);
  await assertKnownCaseArtifacts(
    root,
    date,
    cases.map((teacherCase) => teacherCase.id),
  );
  const context = {
    root,
    date,
    promptTemplate: refreshInputs.prompt,
    legacy: refreshInputs.legacy,
  };
  for (const teacherCase of cases) await auditCase(context, teacherCase);
  const expectedManifest = await verifyArtifacts(root, date, verifyManifest, context.legacy);
  return {
    eligibility: context.legacy ? "historical" : "conforming",
    cases: cases.length,
    runs: cases.length * auditedProviders(context.legacy).length,
    fixtures: cases.length,
    artifacts: expectedManifest.artifacts.length,
  };
}

export { assertKnownCaseArtifacts } from "./audit-case-artifacts.ts";

async function readAuditInputs(
  root: string,
  date: string,
): Promise<{ corpus: unknown; prompt: string; legacy: boolean }> {
  const inputDirectory = `${root}/runs/${date}/inputs`;
  const corpusExists = await Bun.file(`${inputDirectory}/corpus.json`).exists();
  const promptExists = await Bun.file(`${inputDirectory}/prompt.md`).exists();
  if (corpusExists !== promptExists) throw new Error(`incomplete audit input snapshot: ${date}`);
  if (corpusExists) return { ...(await readRefreshInputs(root, date)), legacy: false };

  const manifestPath = `${root}/runs/${date}/manifest.json`;
  if (!(await Bun.file(manifestPath).exists()))
    throw new Error(`missing audit input snapshot: ${date}`);
  const manifest = record(await Bun.file(manifestPath).json(), "legacy teacher manifest");
  const artifacts = array(manifest.artifacts, "legacy teacher manifest artifacts");
  if (
    artifacts.some((artifact) =>
      String(record(artifact, "legacy teacher manifest artifact").path).startsWith(
        `runs/${date}/inputs/`,
      ),
    )
  ) {
    throw new Error(`missing audit input snapshot: ${date}`);
  }
  return {
    corpus: undefined,
    prompt: "",
    legacy: true,
  };
}

async function legacyTeacherCases(root: string, date: string): Promise<TeacherCase[]> {
  const cases: TeacherCase[] = [];
  for await (const path of new Bun.Glob("*/fixture.json").scan({
    cwd: `${root}/fixtures/${date}/cases`,
    onlyFiles: true,
  })) {
    const fixture = record(
      await Bun.file(`${root}/fixtures/${date}/cases/${path}`).json(),
      "legacy teacher fixture",
    );
    cases.push({
      id: requiredString(fixture.case_id, "legacy fixture case_id"),
      locale: requiredString(fixture.locale, "legacy fixture locale"),
      question: requiredString(fixture.question, "legacy fixture question"),
    });
  }
  cases.sort((left, right) => left.id.localeCompare(right.id));
  if (cases.length !== 20)
    throw new Error(`legacy corpus must contain 20 cases, got ${cases.length}`);
  return cases;
}

/**
 * The sealed pre-ADR-0006 refresh retains both teachers; current refreshes are
 * Codex-only.
 */
function auditedProviders(legacy: boolean): ("codex" | "claude")[] {
  return legacy ? ["codex", "claude"] : ["codex"];
}

async function auditCase(context: AuditContext, teacherCase: TeacherCase): Promise<void> {
  for (const provider of auditedProviders(context.legacy)) {
    await auditRun(context, teacherCase, provider);
  }
  await auditFixture(context, teacherCase);
}

async function auditRun(
  context: AuditContext,
  teacherCase: TeacherCase,
  provider: "codex" | "claude",
): Promise<void> {
  const directory = `${context.root}/runs/${context.date}/cases/${teacherCase.id}/${provider}`;
  const run = record(await Bun.file(`${directory}/run.json`).json(), "teacher run");
  validateTeacherRun(run);
  assertRunIdentity(context, teacherCase, provider, run);
  const events = await jsonl(`${directory}/${String(run.raw_trace)}`);
  const inspection = context.legacy
    ? provider === "codex"
      ? inspectLegacyCodexProbe(events)
      : inspectLegacyClaudeProbe(events)
    : inspectCodexProbe(events);
  if (!inspection.accepted || inspection.forbidden_tool_calls.length !== 0) {
    throw new Error(`${teacherCase.id}/${provider} violates the teacher tool policy`);
  }
  if (!context.legacy) {
    const normalized = normalizeTeacherRun(
      provider,
      events,
      provider === "codex" ? String(run.model) : undefined,
    );
    for (const [key, expected] of Object.entries(normalized)) {
      if (JSON.stringify(run[key]) !== JSON.stringify(expected)) {
        throw new Error(`${teacherCase.id}/${provider} has a stale ${key} projection`);
      }
    }
  }
  const policy = record(
    await Bun.file(`${directory}/${String(run.policy_evidence)}`).json(),
    "teacher policy",
  );
  assertPolicy(context, teacherCase, provider, run, policy);
  const assertCorpusSanitized = context.legacy ? assertLegacySanitized : assertSanitized;
  assertCorpusSanitized(events, `${teacherCase.id}/${provider} events`);
  assertCorpusSanitized(policy, `${teacherCase.id}/${provider} policy`);
  assertCorpusSanitized(run, `${teacherCase.id}/${provider} run`);
}

function assertRunIdentity(
  context: AuditContext,
  teacherCase: TeacherCase,
  provider: "codex" | "claude",
  run: JsonRecord,
): void {
  if (run.run_id !== `${context.date}_${provider}_${teacherCase.id}`) {
    throw new Error(`${teacherCase.id}/${provider} has an unexpected run_id`);
  }
  if (
    run.case_id !== teacherCase.id ||
    run.provider !== provider ||
    run.locale !== teacherCase.locale
  ) {
    throw new Error(`${teacherCase.id}/${provider} has mismatched identity or locale`);
  }
  if (!context.legacy) {
    const prompt = context.promptTemplate.replace("{{question}}", teacherCase.question);
    const digest = new Bun.CryptoHasher("sha256").update(prompt).digest("hex");
    if (run.prompt_sha256 !== digest)
      throw new Error(`${teacherCase.id}/${provider} has a mismatched prompt digest`);
  }
}

function assertPolicy(
  context: AuditContext,
  teacherCase: TeacherCase,
  provider: "codex" | "claude",
  run: JsonRecord,
  policy: JsonRecord,
): void {
  assertPolicyMetadata(context, teacherCase, provider, run, policy);
  if (context.legacy) {
    // The sealed 2026-08-27 refresh still carries Claude runs; its isolation
    // flags must stay audited even though current refreshes are Codex-only.
    if (provider === "claude") assertLegacyClaudePolicy(teacherCase, policy);
    return;
  }
  const command = policyCommand(context, teacherCase, provider, policy);
  assertCurrentCodexPolicy(command, teacherCase, run);
}

/** Verifies the retained historical Claude runs kept their native tool policy. */
function assertLegacyClaudePolicy(teacherCase: TeacherCase, policy: JsonRecord): void {
  // Empty strings are legitimate here: the isolation flags include
  // `--setting-sources ""`, so only the type is asserted.
  const command = array(policy.command, "legacy teacher policy command").map((value, index) => {
    if (typeof value !== "string") {
      throw new Error(`legacy teacher policy command[${index}] must be a string`);
    }
    return value;
  });
  // Every sealed 2026-08-27 Claude run enabled both native Web tools; the
  // search-only variant belonged to the later, now-retired refresh.
  assertLegacyClaudeIsolationCommand(command, "WebSearch,WebFetch");
  assertCommandPair(command, "--output-format", "stream-json");
  for (const flag of ["--verbose", "--include-partial-messages", "--include-hook-events"]) {
    assertCommandFlag(command, flag);
  }
}

function assertPolicyMetadata(
  context: AuditContext,
  teacherCase: TeacherCase,
  provider: "codex" | "claude",
  run: JsonRecord,
  policy: JsonRecord,
): void {
  if (policy.provider !== provider || policy.cli_version !== run.cli_version) {
    throw new Error(`${teacherCase.id}/${provider} has mismatched policy metadata`);
  }
  if (policy.started_at !== run.started_at || policy.duration_ms !== run.duration_ms) {
    throw new Error(`${teacherCase.id}/${provider} has mismatched policy timing`);
  }
  const process = record(policy.process, "teacher policy process");
  if (process.exit_code !== 0 || process.failure !== undefined) {
    throw new Error(`${teacherCase.id}/${provider} teacher process did not exit successfully`);
  }
  const controls = record(policy.controls, "teacher policy controls");
  const isolated = controls.isolated_temporary_cwd === true && controls.cwd_unchanged === true;
  const disabled =
    controls.wrapper_shim_bypassed === true && controls.session_persistence_disabled === true;
  const settingsDisabled =
    provider !== "claude" || controls.user_project_settings_disabled === true;
  if (!context.legacy && provider !== "codex") {
    throw new Error(`${teacherCase.id} has a non-Codex teacher run in a current refresh`);
  }
  if (!isolated || !disabled || !settingsDisabled) {
    throw new Error(
      `${teacherCase.id}/${provider} has incomplete isolation evidence in ${context.date}`,
    );
  }
}

function policyCommand(
  context: AuditContext,
  teacherCase: TeacherCase,
  provider: "codex" | "claude",
  policy: JsonRecord,
): string[] {
  const command = array(policy.command, "teacher policy command").map((value, index) => {
    if (typeof value !== "string")
      throw new Error(`teacher policy command[${index}] must be a string`);
    return value;
  });
  const expectedPrompt = context.promptTemplate.replace("{{question}}", teacherCase.question);
  if (command.at(-1) !== expectedPrompt) {
    throw new Error(`${teacherCase.id}/${provider} did not use the snapshotted common prompt`);
  }
  if (provider !== "codex")
    throw new Error(`${teacherCase.id} has a non-Codex teacher run in a current refresh`);
  return command;
}

function assertCurrentCodexPolicy(
  command: string[],
  teacherCase: TeacherCase,
  run: JsonRecord,
): void {
  assertCommandPair(command, "--model", requiredString(run.model, "Codex run model"));
  for (const flag of [
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--skip-git-repo-check",
  ])
    assertCommandFlag(command, flag);
  assertCommandPair(command, "--sandbox", "read-only");
  assertCommandPair(command, "-c", 'approval_policy="never"');
  assertCommandPair(command, "-c", 'history.persistence="none"');
  for (const control of ['web_search="live"', ...codexSkillControls]) {
    if (!command.includes(control))
      throw new Error(`${teacherCase.id}/codex is missing policy control ${control}`);
  }
  for (const feature of codexDisabledFeatures) assertCommandPair(command, "--disable", feature);
}

async function auditFixture(context: AuditContext, teacherCase: TeacherCase): Promise<void> {
  const directory = `${context.root}/fixtures/${context.date}/cases/${teacherCase.id}`;
  const draft = await Bun.file(`${directory}/draft.json`).json();
  const verification = await Bun.file(`${directory}/verification.json`).json();
  const fixture = await Bun.file(`${directory}/fixture.json`).json();
  validateFixture(fixture);
  if (context.legacy) {
    const expected = assembleLegacyFixture(teacherCase, context.date, draft, verification);
    if (JSON.stringify(fixture) !== JSON.stringify(expected)) {
      throw new Error(`${teacherCase.id} legacy fixture differs from its archived derivation`);
    }
    const legacyEnvelope = record(
      await Bun.file(`${directory}/claude-result.sanitized.json`).json(),
      "legacy Claude verification envelope",
    );
    const expectedLegacyVerification = verificationFromLegacyClaudeEnvelope(
      legacyEnvelope,
      legacyClaudeModel,
    );
    if (JSON.stringify(verification) !== JSON.stringify(expectedLegacyVerification)) {
      throw new Error(`${teacherCase.id} verification differs from the archived Claude output`);
    }
    await assertFixtureFiles(directory, teacherCase.id, true);
    return;
  }
  const evidence = await Bun.file(`${directory}/evidence.json`).json();
  const expectedEvidence = {
    schema_version: 1,
    case_id: teacherCase.id,
    runs: await Promise.all(
      auditedProviders(context.legacy).map(async (provider) =>
        compactRun(
          await Bun.file(
            `${context.root}/runs/${context.date}/cases/${teacherCase.id}/${provider}/run.json`,
          ).json(),
        ),
      ),
    ),
  };
  if (JSON.stringify(evidence) !== JSON.stringify(expectedEvidence)) {
    throw new Error(`${teacherCase.id} fixture evidence differs from its teacher runs`);
  }
  const derivationEvents = await jsonl(`${directory}/codex-events.sanitized.jsonl`);
  const expectedDraft = normalizeDraftEvidence(evidence, draftFromEvents(derivationEvents));
  validateDraftEvidence(evidence, expectedDraft);
  if (JSON.stringify(draft) !== JSON.stringify(expectedDraft)) {
    throw new Error(`${teacherCase.id} draft differs from the archived Codex output`);
  }
  const expectedVerification = verifyDraftGrounding(evidence, draft);
  if (JSON.stringify(verification) !== JSON.stringify(expectedVerification)) {
    throw new Error(`${teacherCase.id} verification differs from its deterministic recomputation`);
  }
  const expected = assembleFixture(teacherCase, context.date, evidence, draft, verification);
  if (JSON.stringify(fixture) !== JSON.stringify(expected)) {
    throw new Error(`${teacherCase.id} fixture differs from its archived derivation`);
  }
  await assertFixtureFiles(directory, teacherCase.id, false);
  const derivationPolicy = record(
    await Bun.file(`${directory}/derivation-policy.json`).json(),
    "fixture derivation policy",
  );
  assertSuccessfulPolicy(derivationPolicy, "codex", teacherCase.id);
  if (derivationPolicy.model !== "gpt-5.4") {
    throw new Error(`${teacherCase.id} fixture derivation used an unexpected model`);
  }
  const controls = record(derivationPolicy.controls, "fixture derivation controls");
  if (controls.tools_disabled !== true || controls.skills_disabled !== true)
    throw new Error(`${teacherCase.id} fixture derivation did not disable tools and skills`);
  const command = array(derivationPolicy.command, "fixture derivation command").map(
    (value, index) => requiredString(value, `fixture derivation command[${index}]`),
  );
  for (const control of ['web_search="disabled"', ...codexSkillControls]) {
    if (!command.includes(control)) {
      throw new Error(`${teacherCase.id} fixture derivation is missing policy control ${control}`);
    }
  }
  for (const feature of codexDisabledFeatures) assertCommandPair(command, "--disable", feature);

  const verificationPolicy = record(
    await Bun.file(`${directory}/verification-policy.json`).json(),
    "fixture verification policy",
  );
  if (
    verificationPolicy.verifier !== "grounding" ||
    verificationPolicy.deterministic !== true ||
    verificationPolicy.uses_llm !== false ||
    verificationPolicy.uses_network !== false
  ) {
    throw new Error(`${teacherCase.id} fixture verification is not the deterministic verifier`);
  }
  const accepted = array(
    record(verification, "fixture verification").accepted_claim_ids,
    "accepted_claim_ids",
    true,
  ).length;
  const rejected = array(
    record(verification, "fixture verification").rejected_claims,
    "verification rejected_claims",
    true,
  ).length;
  if (verificationPolicy.accepted !== accepted || verificationPolicy.rejected !== rejected) {
    throw new Error(`${teacherCase.id} fixture verification policy miscounts its outcome`);
  }
}

function draftFromEvents(events: unknown[]): unknown {
  let draft: unknown;
  for (const [index, eventValue] of events.entries()) {
    const event = record(eventValue, `fixture derivation event[${index}]`);
    if (event.type !== "item.completed") continue;
    const item = record(event.item, `fixture derivation event[${index}].item`);
    if (item.type === "agent_message") {
      if (draft !== undefined) throw new Error("fixture derivation emitted multiple drafts");
      draft = JSON.parse(requiredString(item.text, "fixture derivation agent message"));
    } else if (item.type !== "reasoning") {
      throw new Error(`fixture derivation used forbidden item type: ${String(item.type)}`);
    }
  }
  if (draft === undefined) throw new Error("fixture derivation emitted no draft");
  return draft;
}

function assertSuccessfulPolicy(
  policy: JsonRecord,
  provider: "codex" | "claude",
  caseId: string,
): void {
  if (policy.provider !== provider || typeof policy.model !== "string") {
    throw new Error(`${caseId} has mismatched ${provider} fixture policy metadata`);
  }
  requiredString(policy.cli_version, `${provider} fixture policy CLI version`);
  requiredString(policy.started_at, `${provider} fixture policy start`);
  if (typeof policy.duration_ms !== "number" || policy.duration_ms < 0) {
    throw new Error(`${caseId} has invalid ${provider} fixture policy duration`);
  }
  const process = record(policy.process, `${provider} fixture policy process`);
  if (process.exit_code !== 0 || process.failure !== undefined) {
    throw new Error(`${caseId} ${provider} fixture process failed`);
  }
}

function assertCommandPair(command: string[], flag: string, value: string): void {
  if (!command.some((entry, index) => entry === flag && command[index + 1] === value)) {
    throw new Error(`fixture policy command is missing ${flag} ${value}`);
  }
}

function assertCommandFlag(command: string[], flag: string): void {
  if (!command.includes(flag)) throw new Error(`fixture policy command is missing ${flag}`);
}

function assertLegacyClaudeIsolationCommand(command: string[], allowedTools: string): void {
  const expected = legacyClaudeIsolationArgs(allowedTools);
  for (let index = 0; index < expected.length; index += 1) {
    const entry = expected[index]!;
    if (entry.startsWith("--")) {
      const next = expected[index + 1];
      if (next === undefined || next.startsWith("--")) assertCommandFlag(command, entry);
      else assertCommandPair(command, entry, next);
    }
  }
  assertCommandPair(command, "--settings", JSON.stringify(legacyClaudeDisabledPlugins));
}

async function assertFixtureFiles(
  directory: string,
  caseId: string,
  legacy: boolean,
): Promise<void> {
  for (const required of [
    "evidence.json",
    "codex-events.sanitized.jsonl",
    "derivation-policy.json",
    ...(legacy ? ["claude-result.sanitized.json"] : []),
    "verification-policy.json",
  ]) {
    if (!(await Bun.file(`${directory}/${required}`).exists()))
      throw new Error(`${caseId} is missing ${required}`);
  }
  const assertCorpusSanitized = legacy ? assertLegacySanitized : assertSanitized;
  for (const path of new Bun.Glob("*").scanSync({
    cwd: directory,
    onlyFiles: true,
  })) {
    if (path.endsWith(".json"))
      assertCorpusSanitized(await Bun.file(`${directory}/${path}`).json(), `${caseId}/${path}`);
    if (path.endsWith(".jsonl"))
      assertCorpusSanitized(await jsonl(`${directory}/${path}`), `${caseId}/${path}`);
  }
}

async function verifyArtifacts(
  root: string,
  date: string,
  verify: boolean,
  legacy: boolean,
): Promise<Manifest> {
  const expected = await createManifest(root, date);
  for (const artifact of expected.artifacts) {
    if (legacy) await assertLegacyArtifactSanitized(root, artifact.path);
    else await assertArtifactSanitized(root, artifact.path);
  }
  if (!verify) return expected;
  const manifest: unknown = await Bun.file(`${root}/runs/${date}/manifest.json`).json();
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new Error("teacher artifact manifest does not match the immutable corpus");
  }
  const artifacts = record(manifest, "teacher artifact manifest").artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0)
    throw new Error("teacher artifact manifest must not be empty");
  return expected;
}

export { assertLegacySanitized } from "./audit-legacy.ts";
