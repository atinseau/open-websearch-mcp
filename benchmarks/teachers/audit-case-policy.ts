import {
  legacyClaudeDisabledPlugins,
  legacyClaudeIsolationArgs,
} from "./claude-policy-controls.ts";
import { array, record, requiredString, type JsonRecord } from "./contract-json.ts";
import { codexDisabledFeatures, codexSkillControls } from "./policy-controls.ts";

/** The corpus case an audited artifact belongs to. */
export type TeacherCase = { id: string; locale: string; question: string };

/** Where an audit reads from, and whether it audits the sealed legacy refresh. */
export type AuditContext = {
  root: string;
  date: string;
  promptTemplate: string;
  legacy: boolean;
};

export function assertSuccessfulPolicy(
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

export function assertCommandPair(command: string[], flag: string, value: string): void {
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

export function assertRunIdentity(
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

export function assertPolicy(
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
  assertPolicyIdentity(policy, run, teacherCase.id, provider);
  assertPolicyProcess(policy, teacherCase.id, provider);
  assertPolicyIsolation(context, teacherCase.id, provider, policy);
}

function assertPolicyIdentity(
  policy: JsonRecord,
  run: JsonRecord,
  caseId: string,
  provider: "codex" | "claude",
): void {
  if (policy.provider !== provider || policy.cli_version !== run.cli_version)
    throw new Error(`${caseId}/${provider} has mismatched policy metadata`);
  if (policy.started_at !== run.started_at || policy.duration_ms !== run.duration_ms)
    throw new Error(`${caseId}/${provider} has mismatched policy timing`);
}

function assertPolicyProcess(
  policy: JsonRecord,
  caseId: string,
  provider: "codex" | "claude",
): void {
  const process = record(policy.process, "teacher policy process");
  if (process.exit_code !== 0 || process.failure !== undefined)
    throw new Error(`${caseId}/${provider} teacher process did not exit successfully`);
}

function assertPolicyIsolation(
  context: AuditContext,
  caseId: string,
  provider: "codex" | "claude",
  policy: JsonRecord,
): void {
  const controls = record(policy.controls, "teacher policy controls");
  const isolated = controls.isolated_temporary_cwd === true && controls.cwd_unchanged === true;
  const disabled =
    controls.wrapper_shim_bypassed === true && controls.session_persistence_disabled === true;
  const settingsDisabled =
    provider !== "claude" || controls.user_project_settings_disabled === true;
  if (!context.legacy && provider !== "codex") {
    throw new Error(`${caseId} has a non-Codex teacher run in a current refresh`);
  }
  if (!isolated || !disabled || !settingsDisabled) {
    throw new Error(`${caseId}/${provider} has incomplete isolation evidence in ${context.date}`);
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
