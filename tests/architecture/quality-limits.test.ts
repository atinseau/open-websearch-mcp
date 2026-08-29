import { expect, test } from "bun:test";

const repository = import.meta.dir.slice(0, -"/tests/architecture".length);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected an object");
  }
  const entries: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) entries[key] = item;
  return entries;
}

async function manifest(): Promise<Record<string, unknown>> {
  return record(await Bun.file(`${repository}/package.json`).json());
}

// The exact ARCH-007 thresholds. `max-statements` is deliberately absent: the
// requirement names file lines, function lines, complexity, depth, parameters,
// and import declarations, and no agent may add a permanent constraint the
// specification does not state.
const rules = {
  "max-lines": ["error", 300],
  "max-lines-per-function": ["error", 60],
  complexity: ["error", 10],
  "max-depth": ["error", 4],
  "max-params": ["error", 5],
};

type QualityRule = keyof typeof rules;

async function lint(
  fixture: string,
  rule: QualityRule,
): Promise<{ readonly output: string; readonly exitCode: number }> {
  const directory = `/tmp/open-websearch-quality-${crypto.randomUUID()}`;
  const configuration = `${directory}/.oxlintrc.json`;
  await Bun.$`mkdir ${directory}`.quiet();
  await Bun.write(
    configuration,
    JSON.stringify({ ignorePatterns: [], rules: { [rule]: rules[rule] } }),
  );

  try {
    const child = Bun.spawn(
      ["bun", "x", "oxlint", "--disable-nested-config", "--config", configuration, fixture],
      { cwd: repository, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { output: `${stdout}${stderr}`, exitCode };
  } finally {
    await Bun.file(configuration).delete();
    await Bun.$`rmdir ${directory}`.quiet();
  }
}

const cases = [
  ["max-lines", "max-lines"],
  ["max-lines-per-function", "max-lines-per-function"],
  ["complexity", "complexity"],
  ["max-depth", "max-depth"],
  ["max-params", "max-params"],
] as const;

test("ARCH-007 native limits accept their positive fixtures", async () => {
  for (const [fixture, rule] of cases) {
    const outcome = await lint(`tests/architecture/fixtures/valid/${fixture}.ts`, rule);
    expect(outcome.exitCode).toBe(0);
  }
});

test("ARCH-007 native limits reject their negative fixtures", async () => {
  for (const [fixture, rule] of cases) {
    const outcome = await lint(`tests/architecture/fixtures/invalid/${fixture}.ts`, rule);
    expect(outcome.exitCode, `${fixture}: ${outcome.output}`).not.toBe(0);
    expect(outcome.output).toContain(rule);
  }
});

test("ARCH-007 thresholds are configured repository-wide", async () => {
  const configuration = record(
    Bun.JSONC.parse(await Bun.file(`${repository}/.oxlintrc.jsonc`).text()),
  );
  const configured = record(configuration.rules);

  for (const [rule, expected] of Object.entries(rules)) {
    expect(configured[rule]).toEqual(expected);
  }

  const scripts = record((await manifest()).scripts);
  expect(scripts["lint:limits"]).toBeString();
  // ADR-0008's debt is cleared: the limits now live in the root configuration
  // and every product, script, test, and benchmark path is checked against
  // them. The gate must therefore cover all four roots, not `src` alone.
  for (const root of ["src", "scripts", "tests", "benchmarks"]) {
    expect(scripts["lint:limits"]).toContain(root);
  }
  expect(scripts.check).toContain("lint:limits");
});

test("ARCH-007 gate fails on a violation inside product source", async () => {
  const probe = `${repository}/src/features/ranking/quality-limit-probe.ts`;
  await Bun.write(
    probe,
    await Bun.file(`${repository}/tests/architecture/fixtures/invalid/complexity.ts`).text(),
  );

  try {
    const child = Bun.spawn(["bun", "run", "lint:limits"], {
      cwd: repository,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode, `${stdout}${stderr}`).not.toBe(0);
    expect(`${stdout}${stderr}`).toContain("complexity");
  } finally {
    await Bun.file(probe).delete();
  }
});
