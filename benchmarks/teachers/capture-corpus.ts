import { captureProbe } from "./capture-probe.ts";
import { teacherCases } from "./contract.ts";
import { requiredDate } from "./contract-json.ts";
import { normalizeCapture } from "./normalize-capture.ts";
import { ensureRefreshInputs } from "./refresh-inputs.ts";

const root = import.meta.dir;
const date = Bun.argv[2] ?? new Date().toISOString().slice(0, 10);
requiredDate(date, "capture date");
const cases = teacherCases((await ensureRefreshInputs(root, date)).corpus);

async function capture(provider: "codex", caseId: string): Promise<number> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await captureProbe(provider, caseId, date);
      return 0;
    } catch (error) {
      await Bun.write(Bun.stderr, `${String(error)}\n`);
    }
  }
  return 1;
}

for (const teacherCase of cases) {
  const pending: "codex"[] = [];
  for (const provider of ["codex"] as const) {
    const run = `${root}/runs/${date}/cases/${teacherCase.id}/${provider}/run.json`;
    if (await Bun.file(run).exists()) continue;
    const events = `${root}/runs/${date}/cases/${teacherCase.id}/${provider}/events.sanitized.jsonl`;
    if (await Bun.file(events).exists()) {
      try {
        await normalizeCapture(provider, teacherCase.id, date);
      } catch (error) {
        await Bun.write(Bun.stderr, `${String(error)}\n`);
        throw new Error(`${teacherCase.id}/${provider} normalization failed`, { cause: error });
      }
      continue;
    }
    pending.push(provider);
  }
  if (pending.length === 0) {
    console.log(JSON.stringify({ case_id: teacherCase.id, status: "already-captured" }));
    continue;
  }

  const results = await Promise.all(
    pending.map(async (provider) => {
      return { provider, exit_code: await capture(provider, teacherCase.id) };
    }),
  );
  const failed = results.filter((result) => result.exit_code !== 0);
  if (failed.length > 0) {
    throw new Error(`${teacherCase.id} failed: ${JSON.stringify(failed)}`);
  }
}
