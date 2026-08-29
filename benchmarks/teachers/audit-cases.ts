import {
  assertArtifactSanitized,
  assertSanitized,
  createManifest,
  jsonl,
  type Manifest,
} from "./audit-artifacts.ts";
import { legacyClaudeModel } from "./claude-policy-controls.ts";
import {
  assembleFixture,
  assembleLegacyFixture,
  inspectCodexProbe,
  normalizeTeacherRun,
  teacherCases,
  validateFixture,
  validateTeacherRun,
} from "./contract.ts";
import { record, requiredDate, requiredString } from "./contract-json.ts";
import { assertLegacyArtifactSanitized, assertLegacySanitized } from "./audit-legacy.ts";
import { compactRun } from "./derive-fixture-support.ts";
import {
  normalizeDraftEvidence,
  validateDraftEvidence,
  verificationFromLegacyClaudeEnvelope,
} from "./fixture-contract.ts";
import { verifyDraftGrounding } from "./fixture-grounding.ts";
import { inspectLegacyClaudeProbe, inspectLegacyCodexProbe } from "./contract-probes.ts";
import { assertKnownCaseArtifacts } from "./audit-case-artifacts.ts";
import {
  assertPolicy,
  assertRunIdentity,
  type AuditContext,
  type TeacherCase,
} from "./audit-case-policy.ts";
import { assertDerivationPolicy, assertVerificationPolicy } from "./audit-fixture-policy.ts";
import { auditedProviders, legacyTeacherCases, readAuditInputs } from "./audit-case-inputs.ts";

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

async function auditFixture(context: AuditContext, teacherCase: TeacherCase): Promise<void> {
  const directory = `${context.root}/fixtures/${context.date}/cases/${teacherCase.id}`;
  const draft = await Bun.file(`${directory}/draft.json`).json();
  const verification = await Bun.file(`${directory}/verification.json`).json();
  const fixture = await Bun.file(`${directory}/fixture.json`).json();
  validateFixture(fixture);
  if (context.legacy) {
    await auditLegacyFixture({ context, teacherCase, directory, draft, verification, fixture });
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
  assertDerivationPolicy(
    await Bun.file(`${directory}/derivation-policy.json`).json(),
    teacherCase.id,
  );
  assertVerificationPolicy(
    await Bun.file(`${directory}/verification-policy.json`).json(),
    verification,
    teacherCase.id,
  );
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

/**
 * Audits a case from the sealed pre-ADR-0006 refresh. Its fixture was derived
 * and verified by Claude, so it is checked against the archived Claude
 * envelope rather than the deterministic grounding verifier used since.
 */
async function auditLegacyFixture(input: {
  context: AuditContext;
  teacherCase: TeacherCase;
  directory: string;
  draft: unknown;
  verification: unknown;
  fixture: unknown;
}): Promise<void> {
  const { context, teacherCase, directory, draft, verification, fixture } = input;
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
}
