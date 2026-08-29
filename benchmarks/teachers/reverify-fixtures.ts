import { assembleFixture, teacherCases, validateFixture } from "./contract.ts";
import { requiredDate } from "./contract-json.ts";
import { verifyDraftGrounding } from "./fixture-grounding.ts";
import { commandOutput } from "./process-controls.ts";
import { withRefreshMutation } from "./refresh-lifecycle.ts";
import { readRefreshInputs } from "./refresh-inputs.ts";

/**
 * Recomputes the deterministic verification and reassembles each fixture from
 * its already-archived Codex draft. Deriving drafts costs one Codex run per
 * case; re-verifying them costs nothing and must stay reproducible, so a
 * grounding-rule change is replayed here instead of by recapturing.
 */
const root = import.meta.dir;
const date = Bun.argv[2];
if (date === undefined) throw new Error("usage: bun reverify-fixtures.ts <YYYY-MM-DD>");
requiredDate(date, "fixture date");

const cases = teacherCases((await readRefreshInputs(root, date)).corpus);

await withRefreshMutation(root, date, async () => {
  for (const teacherCase of cases) {
    const directory = `${root}/fixtures/${date}/cases/${teacherCase.id}`;
    const evidence = await Bun.file(`${directory}/evidence.json`).json();
    const draft = await Bun.file(`${directory}/draft.json`).json();
    const verification = verifyDraftGrounding(evidence, draft);
    const fixture = assembleFixture(teacherCase, date, evidence, draft, verification);
    validateFixture(fixture);
    for (const [name, value] of [
      ["verification.json", verification],
      [
        "verification-policy.json",
        {
          schema_version: 1,
          verifier: "grounding",
          deterministic: true,
          uses_llm: false,
          uses_network: false,
          accepted: verification.accepted_claim_ids.length,
          rejected: verification.rejected_claims.length,
        },
      ],
      ["fixture.json", fixture],
    ] as const) {
      const path = `${directory}/${name}`;
      const temporary = `${path}.tmp-${crypto.randomUUID()}`;
      try {
        await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
        await commandOutput(["/bin/mv", temporary, path]);
      } finally {
        if (await Bun.file(temporary).exists()) await Bun.file(temporary).delete();
      }
    }
    console.log(
      JSON.stringify({
        case_id: teacherCase.id,
        accepted: verification.accepted_claim_ids.length,
        rejected: verification.rejected_claims.length,
      }),
    );
  }
});
