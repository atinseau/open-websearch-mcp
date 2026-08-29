import {
  inspectCodexProbe,
  normalizeTeacherRun,
  teacherCases,
  validateTeacherRun,
} from "./contract.ts";
import { record, requiredDate } from "./contract-json.ts";
import { commandOutput } from "./process-controls.ts";
import { assertRefreshWritable, withRefreshMutation } from "./refresh-lifecycle.ts";
import { readRefreshInputs } from "./refresh-inputs.ts";

export async function normalizeCapture(
  provider: "codex",
  caseId: string,
  date = new Date().toISOString().slice(0, 10),
  root = import.meta.dir,
): Promise<void> {
  requiredDate(date, "capture date");
  await assertRefreshWritable(root, date);
  const output = `${root}/runs/${date}/cases/${caseId}/${provider}`;
  const runPath = `${output}/run.json`;
  if (await Bun.file(runPath).exists()) throw new Error(`immutable run already exists: ${runPath}`);
  const { teacherCase, prompt } = await captureCase(root, date, caseId);
  const { policy, controls, events, inspection } = await captureEvidence(output, provider);
  const run = createRun({
    date,
    provider,
    teacherCase,
    prompt,
    policy,
    controls,
    events,
    inspection,
  });
  validateTeacherRun(run);
  await persistRun(root, date, runPath, run);
  console.log(JSON.stringify({ provider, case_id: caseId, run: runPath }));
}

async function captureCase(
  root: string,
  date: string,
  caseId: string,
): Promise<{ teacherCase: ReturnType<typeof teacherCases>[number]; prompt: string }> {
  const refreshInputs = await readRefreshInputs(root, date);
  const teacherCase = teacherCases(refreshInputs.corpus).find((item) => item.id === caseId);
  if (teacherCase === undefined) throw new Error(`unknown case: ${caseId}`);
  return {
    teacherCase,
    prompt: refreshInputs.prompt.replace("{{question}}", teacherCase.question),
  };
}

async function captureEvidence(
  output: string,
  provider: string,
): Promise<{
  policy: Record<string, unknown>;
  controls: Record<string, unknown>;
  events: unknown[];
  inspection: ReturnType<typeof inspectCodexProbe>;
}> {
  const policy = record(await Bun.file(`${output}/policy.json`).json(), "capture policy");
  const controls = record(policy.controls, "capture policy controls");
  assertCapturePolicy(record(policy.process, "capture policy process"), controls, provider);
  const events = (await Bun.file(`${output}/events.sanitized.jsonl`).text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const inspection = inspectCodexProbe(events);
  if (!inspection.accepted) throw new Error(`${provider} event policy was not accepted`);
  return { policy, controls, events, inspection };
}

function assertCapturePolicy(
  processResult: Record<string, unknown>,
  controls: Record<string, unknown>,
  provider: string,
): void {
  if (processResult.exit_code !== 0 || processResult.failure !== undefined)
    throw new Error(`${provider} capture process did not complete successfully`);
  const isolated = [
    "isolated_temporary_cwd",
    "cwd_unchanged",
    "wrapper_shim_bypassed",
    "session_persistence_disabled",
  ].every((key) => controls[key] === true);
  if (!isolated) throw new Error(`${provider} capture policy does not prove isolation`);
}

function createRun(input: {
  date: string;
  provider: string;
  teacherCase: ReturnType<typeof teacherCases>[number];
  prompt: string;
  policy: Record<string, unknown>;
  controls: Record<string, unknown>;
  events: unknown[];
  inspection: ReturnType<typeof inspectCodexProbe>;
}): Record<string, unknown> {
  const { date, provider, teacherCase, prompt, policy, controls, events, inspection } = input;
  const normalized = normalizeTeacherRun(provider, events, "gpt-5.4");
  return {
    schema_version: 1,
    run_id: `${date}_${provider}_${teacherCase.id}`,
    case_id: teacherCase.id,
    provider,
    ...normalized,
    cli_version: policy.cli_version,
    locale: teacherCase.locale,
    started_at: policy.started_at,
    duration_ms: policy.duration_ms,
    prompt_sha256: new Bun.CryptoHasher("sha256").update(prompt).digest("hex"),
    raw_trace: "events.sanitized.jsonl",
    policy_evidence: "policy.json",
    isolation: {
      temporary_cwd: true,
      cwd_unchanged: controls.cwd_unchanged,
      forbidden_tool_calls: inspection.forbidden_tool_calls,
    },
  };
}

async function persistRun(
  root: string,
  date: string,
  runPath: string,
  run: Record<string, unknown>,
): Promise<void> {
  await withRefreshMutation(root, date, async () => {
    if (await Bun.file(runPath).exists())
      throw new Error(`immutable run already exists: ${runPath}`);
    const temporary = `${runPath}.tmp-${crypto.randomUUID()}`;
    try {
      await Bun.write(temporary, `${JSON.stringify(run, null, 2)}\n`);
      await commandOutput(["/bin/mv", temporary, runPath]);
    } finally {
      if (await Bun.file(temporary).exists()) await Bun.file(temporary).delete();
    }
  });
}

if (import.meta.main) {
  const provider = Bun.argv[2];
  const caseId = Bun.argv[3];
  if (provider !== "codex" || caseId === undefined) {
    throw new Error("usage: bun normalize-capture.ts codex <case-id> [YYYY-MM-DD]");
  }
  await normalizeCapture(provider, caseId, Bun.argv[4]);
}
