import { expect, test } from "bun:test";

const repository = import.meta.dir.slice(0, -"/tests/architecture".length);

async function traceability(): Promise<string> {
  return Bun.file(`${repository}/docs/orchestration/traceability.md`).text();
}

/**
 * The traceability document is the project's own account of what is enforced.
 * It drifted before: it reported ARCH-002 and ARCH-007 as blocked long after
 * both were gated, and a stale gap invites the same overstatement a false
 * green does. These tests tie its claims to the artifacts that back them.
 */
test("a requirement claimed as enforced names an artifact that exists", async () => {
  const rows = (await traceability())
    .split("\n")
    .filter((line) => line.startsWith("| ARCH-00") && line.includes("Enforced"));
  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    for (const path of row.match(/[\w./-]+\.(?:ts|jsonc)/gu) ?? []) {
      const candidates = [`${repository}/${path}`, `${repository}/tests/architecture/${path}`];
      const found = await Promise.all(candidates.map((file) => Bun.file(file).exists()));
      expect(found.some(Boolean), `${row.slice(0, 40)} names missing ${path}`).toBe(true);
    }
  }
});

test("ARCH-002 and ARCH-007 are not reported as blocked while their gates run", async () => {
  const text = await traceability();

  // If either gate is ever removed, delete the enforcement claim in the same
  // change rather than letting this test be edited to match.
  for (const id of ["ARCH-002", "ARCH-007"]) {
    const row = text.split("\n").find((line) => line.startsWith(`| ${id} `));
    expect(row, `${id} has no traceability row`).toBeDefined();
    expect(row).not.toContain("BLOCKED");
  }
});

test("every requirement marked BLOCKED has a named gap explaining it", async () => {
  const text = await traceability();
  const blocked = text
    .split("\n")
    .filter((line) => line.startsWith("| ") && line.includes("BLOCKED"))
    .map((line) => line.split("|")[1]?.trim() ?? "");

  for (const id of blocked) {
    const family = id.replace(/-0*(\d+)$/u, "");
    expect(
      text.includes(`**${id}:**`) || text.includes(`**${family}`),
      `${id} is blocked with no explanation`,
    ).toBe(true);
  }
});
