import { assembleFixture, teacherCases, validateFixture } from "./contract.ts";
import { requiredDate } from "./contract-json.ts";
import { deriveDraft, verifyDraft } from "./derive-fixture-runners.ts";
import {
  commandOutput,
  compactRun,
  executable,
  type DerivationContext,
  withAtomicOutputDirectory,
} from "./derive-fixture-support.ts";
import { assertRefreshWritable, withRefreshMutation } from "./refresh-lifecycle.ts";
import { readRefreshInputs } from "./refresh-inputs.ts";

const root = import.meta.dir;
const date = Bun.argv[2];
const requestedCaseId = Bun.argv[3];
if (date === undefined) {
  throw new Error("usage: bun derive-fixtures.ts <YYYY-MM-DD> [case-id]");
}
requiredDate(date, "fixture date");
await assertRefreshWritable(root, date);

const refreshInputs = await readRefreshInputs(root, date);
const allCases = teacherCases(refreshInputs.corpus);
const cases =
  requestedCaseId === undefined
    ? allCases
    : allCases.filter((teacherCase) => teacherCase.id === requestedCaseId);
if (cases.length === 0) throw new Error(`unknown case: ${requestedCaseId}`);

const codex = await executable("codex");
const context: DerivationContext = {
  root,
  date,
  codex,
  codexVersion: await commandOutput([codex, "--version"]),
  draftSchema: await Bun.file(`${root}/schemas/fixture-draft.schema.json`).text(),
};

await withRefreshMutation(root, date, async () => {
  for (const teacherCase of cases) {
    const output = `${root}/fixtures/${date}/cases/${teacherCase.id}`;
    const fixturePath = `${output}/fixture.json`;
    if (await Bun.file(fixturePath).exists()) {
      validateFixture(await Bun.file(fixturePath).json());
      console.log(JSON.stringify({ case_id: teacherCase.id, status: "already-derived" }));
      continue;
    }

    const codexRun = await Bun.file(
      `${root}/runs/${date}/cases/${teacherCase.id}/codex/run.json`,
    ).json();
    const evidence = {
      schema_version: 1,
      case_id: teacherCase.id,
      runs: [compactRun(codexRun)],
    };
    const fixture = await withAtomicOutputDirectory(output, async (staging) => {
      const draft = await deriveDraft(context, teacherCase, evidence, staging);
      const verification = await verifyDraft(context, teacherCase, evidence, draft, staging);
      const assembled = assembleFixture(teacherCase, date, evidence, draft, verification);
      await Bun.write(`${staging}/fixture.json`, `${JSON.stringify(assembled, null, 2)}\n`);
      return assembled;
    });
    console.log(
      JSON.stringify({ case_id: teacherCase.id, status: "derived", claims: fixture.claims.length }),
    );
  }
});
