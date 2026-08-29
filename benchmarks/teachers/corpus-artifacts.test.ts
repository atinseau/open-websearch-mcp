import { expect, test } from "bun:test";

import { auditTeacherCorpus } from "./audit-corpus.ts";
import { assertKnownCaseArtifacts, assertLegacySanitized } from "./audit-cases.ts";
import { assertArtifactSanitized } from "./audit-artifacts.ts";
import { commandOutput } from "./process-controls.ts";

async function expectRejection(action: Promise<unknown>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await action;
  } catch (error) {
    failure = error;
  }
  expect(String(failure)).toContain(message);
}

test("rejects artifacts under an unknown fixture case", async () => {
  const root = await commandOutput([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/fixture-case-audit.XXXXXX`,
  ]);
  try {
    await commandOutput([
      "/bin/mkdir",
      "-p",
      `${root}/fixtures/2026-08-28/cases/unknown-case`,
      `${root}/runs/2026-08-28`,
    ]);
    await Bun.write(`${root}/fixtures/2026-08-28/cases/unknown-case/evidence.json`, "{}\n");
    let failure: unknown;
    try {
      await assertKnownCaseArtifacts(root, "2026-08-28", ["known-case"]);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("unexpected fixtures case artifact");
  } finally {
    await commandOutput(["/bin/rm", "-rf", root]);
  }
});

test("rejects artifacts under an unknown fixture failure case", async () => {
  const root = await commandOutput([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/fixture-failure-audit.XXXXXX`,
  ]);
  try {
    await commandOutput([
      "/bin/mkdir",
      "-p",
      `${root}/fixtures/2026-08-28/failures/unknown-case/claude-attempt`,
      `${root}/runs/2026-08-28`,
    ]);
    await Bun.write(
      `${root}/fixtures/2026-08-28/failures/unknown-case/claude-attempt/result.json`,
      "{}\n",
    );
    let failure: unknown;
    try {
      await assertKnownCaseArtifacts(root, "2026-08-28", ["known-case"]);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("unexpected fixtures failure case artifact");
  } finally {
    await commandOutput(["/bin/rm", "-rf", root]);
  }
});

test("rejects artifacts under an unknown run case", async () => {
  const root = await commandOutput([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/run-case-audit.XXXXXX`,
  ]);
  try {
    await commandOutput([
      "/bin/mkdir",
      "-p",
      `${root}/fixtures/2026-08-28`,
      `${root}/runs/2026-08-28/cases/unknown-case`,
    ]);
    await Bun.write(`${root}/runs/2026-08-28/cases/unknown-case/run.json`, "{}\n");
    let failure: unknown;
    try {
      await assertKnownCaseArtifacts(root, "2026-08-28", ["known-case"]);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("unexpected runs case artifact");
  } finally {
    await commandOutput(["/bin/rm", "-rf", root]);
  }
});

test("rejects artifacts under an unknown run failure case", async () => {
  const root = await commandOutput([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/run-failure-audit.XXXXXX`,
  ]);
  try {
    await commandOutput([
      "/bin/mkdir",
      "-p",
      `${root}/fixtures/2026-08-28`,
      `${root}/runs/2026-08-28/failures/unknown-case/claude-attempt`,
    ]);
    await Bun.write(
      `${root}/runs/2026-08-28/failures/unknown-case/claude-attempt/result.json`,
      "{}\n",
    );
    let failure: unknown;
    try {
      await assertKnownCaseArtifacts(root, "2026-08-28", ["known-case"]);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("unexpected runs failure case artifact");
  } finally {
    await commandOutput(["/bin/rm", "-rf", root]);
  }
});

test("rejects embedded and structured credentials in historical artifacts", () => {
  expect(() =>
    assertLegacySanitized("Authorization: Bearer secret-value", "legacy artifact"),
  ).toThrow("unsanitized legacy data");
  expect(() => assertLegacySanitized("token=secret", "legacy artifact")).toThrow(
    "unsanitized legacy data",
  );
  expect(() => assertLegacySanitized("Basic dTpw", "legacy artifact")).toThrow(
    "unsanitized legacy data",
  );
  expect(() =>
    assertLegacySanitized("https://localhost/callback?code=abc", "legacy artifact"),
  ).toThrow("unsanitized legacy data");
  expect(() => assertLegacySanitized({ accessToken: "secret-value" }, "legacy artifact")).toThrow(
    "unsanitized legacy identity data",
  );
  expect(() =>
    assertLegacySanitized({ credentials: { value: "secret-value" } }, "legacy artifact"),
  ).toThrow("data inside a sensitive legacy object");
});

test("inspects text artifacts and rejects unsupported formats", async () => {
  const root = await commandOutput([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/artifact-format-audit.XXXXXX`,
  ]);
  try {
    await Bun.write(`${root}/prompt.md`, "Authorization: Bearer secret-value\n");
    await Bun.write(`${root}/artifact.txt`, "safe\n");
    await expectRejection(assertArtifactSanitized(root, "prompt.md"), "contains unsanitized data");
    await expectRejection(
      assertArtifactSanitized(root, "artifact.txt"),
      "unsupported teacher artifact type",
    );
  } finally {
    await commandOutput(["/bin/rm", "-rf", root]);
  }
});

test("audits the immutable 20-case teacher corpus", async () => {
  expect(await auditTeacherCorpus(import.meta.dir, "2026-08-28")).toMatchObject({
    eligibility: "conforming",
    cases: 20,
    runs: 20,
    fixtures: 20,
  });
});

test("audits the historical corpus created before input snapshots", async () => {
  expect(await auditTeacherCorpus(import.meta.dir, "2026-08-27")).toMatchObject({
    eligibility: "historical",
    cases: 20,
    runs: 40,
    fixtures: 20,
    artifacts: 740,
  });
});
