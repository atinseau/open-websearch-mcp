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
  const refreshInputs = await readRefreshInputs(root, date);
  const cases = teacherCases(refreshInputs.corpus);
  const teacherCase = cases.find((item) => item.id === caseId);
  if (teacherCase === undefined) throw new Error(`unknown case: ${caseId}`);

  const output = `${root}/runs/${date}/cases/${caseId}/${provider}`;
  const runPath = `${output}/run.json`;
  if (await Bun.file(runPath).exists()) throw new Error(`immutable run already exists: ${runPath}`);
  const policy = record(await Bun.file(`${output}/policy.json`).json(), "capture policy");
  const controls = record(policy.controls, "capture policy controls");
  const processResult = record(policy.process, "capture policy process");
  if (processResult.exit_code !== 0 || processResult.failure !== undefined) {
    throw new Error(`${provider} capture process did not complete successfully`);
  }
  if (
    controls.isolated_temporary_cwd !== true ||
    controls.cwd_unchanged !== true ||
    controls.wrapper_shim_bypassed !== true ||
    controls.session_persistence_disabled !== true
  ) {
    throw new Error(`${provider} capture policy does not prove isolation`);
  }
  const events = (await Bun.file(`${output}/events.sanitized.jsonl`).text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const inspection = inspectCodexProbe(events);
  if (!inspection.accepted) throw new Error(`${provider} event policy was not accepted`);

  const prompt = refreshInputs.prompt.replace("{{question}}", teacherCase.question);
  const normalized = normalizeTeacherRun(provider, events, "gpt-5.4");
  const run = {
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
  validateTeacherRun(run);
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
  console.log(JSON.stringify({ provider, case_id: caseId, run: runPath }));
}

if (import.meta.main) {
  const provider = Bun.argv[2];
  const caseId = Bun.argv[3];
  if (provider !== "codex" || caseId === undefined) {
    throw new Error("usage: bun normalize-capture.ts codex <case-id> [YYYY-MM-DD]");
  }
  await normalizeCapture(provider, caseId, Bun.argv[4]);
}
