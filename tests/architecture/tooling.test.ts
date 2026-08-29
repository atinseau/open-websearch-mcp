import { expect, test } from "bun:test";

const repository = import.meta.dir.slice(0, -"/tests/architecture".length);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError("Expected an object");
  }
  return value;
}

function stringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record(value))) {
    if (typeof item !== "string") throw new TypeError(`Expected ${key} to be a string`);
    result[key] = item;
  }
  return result;
}

async function manifest(): Promise<Record<string, unknown>> {
  const value: unknown = await Bun.file(`${repository}/package.json`).json();
  return record(value);
}

test("ARCH-010 exactly pins the Bun-native toolchain", async () => {
  const packageManifest = await manifest();

  expect(packageManifest.packageManager).toBe("bun@1.4.0");
  expect(packageManifest.engines).toEqual({ bun: "1.4.0" });
  expect(packageManifest.devDependencies).toEqual({
    "@modelcontextprotocol/client": "2.0.0",
    "@types/bun": "1.4.0",
    oxfmt: "0.65.0",
    oxlint: "1.80.0",
    "oxlint-tsgolint": "7.0.2001",
    typescript: "7.0.2",
  });

  for (const dependencies of [packageManifest.dependencies, packageManifest.devDependencies]) {
    for (const version of Object.values(dependencies ? stringRecord(dependencies) : {})) {
      expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
    }
  }
});

test("ARCH-009 keeps project commands on Bun", async () => {
  const scripts = stringRecord((await manifest()).scripts);

  for (const name of [
    "check",
    "format",
    "format:check",
    "lint",
    "lint:types",
    "test",
    "test:architecture",
    "typecheck",
  ]) {
    expect(scripts[name]).toBeString();
  }
  expect(Object.values(scripts).join(" ")).not.toMatch(/\b(?:node|npm|npx|pnpm|yarn|docker)\b/u);
  expect(Object.values(scripts).join(" ")).not.toMatch(
    /\b(?:oxfmt|oxlint)\b[^&]*\s(?:-c|--config)\b/u,
  );
  expect(scripts.format).toContain("--disable-nested-config");
  expect(scripts.lint).toContain("--disable-nested-config");
  expect(scripts.typecheck).toContain("bun x tsc --noEmit");
  expect(scripts.test).toContain("bun test --parallel --isolate");
});

test("ARCH-008 uses strict static JSONC configuration", async () => {
  const tsconfig = record(Bun.JSONC.parse(await Bun.file(`${repository}/tsconfig.json`).text()));
  const lintConfig = record(
    Bun.JSONC.parse(await Bun.file(`${repository}/.oxlintrc.jsonc`).text()),
  );

  expect(record(tsconfig.compilerOptions)).toMatchObject({
    allowImportingTsExtensions: true,
    module: "Preserve",
    moduleResolution: "bundler",
    noEmit: true,
    noUncheckedIndexedAccess: true,
    strict: true,
    types: ["bun"],
    verbatimModuleSyntax: true,
  });
  expect(tsconfig.exclude).toContain("tests/architecture/fixtures");
  expect(lintConfig.plugins).toEqual(["import", "typescript"]);
  expect(record(lintConfig.options)).toMatchObject({
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
  });

  const dynamicConfigs = [
    "oxlint.config.js",
    "oxlint.config.cjs",
    "oxlint.config.mjs",
    "oxlint.config.cts",
    "oxlint.config.mts",
    "oxlint.config.ts",
    "oxfmt.config.js",
    "oxfmt.config.cjs",
    "oxfmt.config.mjs",
    "oxfmt.config.cts",
    "oxfmt.config.mts",
    "oxfmt.config.ts",
  ];
  const dynamicConfigExists = await Promise.all(
    dynamicConfigs.map((path) => Bun.file(`${repository}/${path}`).exists()),
  );
  expect(dynamicConfigExists).toEqual(dynamicConfigs.map(() => false));
  const nestedDynamicConfigs = ["src", "scripts", "tests"].flatMap((directory) =>
    [
      ...new Bun.Glob("**/*.config.{js,cjs,mjs,ts,cts,mts}").scanSync({
        cwd: `${repository}/${directory}`,
      }),
    ].filter((path) => /(?:^|\/)(?:oxlint|oxfmt)\.config\./u.test(path)),
  );
  expect(nestedDynamicConfigs).toEqual([]);
});

test("ARCH-008 preserves the architecture cases owned by SPK-005", async () => {
  const fixtures = [
    ...new Bun.Glob("fixtures/**/*.ts").scanSync({
      cwd: `${repository}/tests/architecture`,
    }),
  ].sort();

  expect(fixtures).toEqual([
    "fixtures/invalid/bare-node-import.ts",
    "fixtures/invalid/bare-node-inspector.ts",
    "fixtures/invalid/bare-node-internal-http.ts",
    "fixtures/invalid/bare-node-internal-stream.ts",
    "fixtures/invalid/bare-node-internal-tls.ts",
    "fixtures/invalid/complexity.ts",
    "fixtures/invalid/cross-feature-internal.ts",
    "fixtures/invalid/cycle-a.ts",
    "fixtures/invalid/cycle-b.ts",
    "fixtures/invalid/max-depth.ts",
    "fixtures/invalid/max-lines-per-function.ts",
    "fixtures/invalid/max-lines.ts",
    "fixtures/invalid/max-params.ts",
    "fixtures/invalid/max-statements.ts",
    "fixtures/invalid/node-import.ts",
    "fixtures/invalid/node-sqlite-import.ts",
    "fixtures/valid/complexity.ts",
    "fixtures/valid/max-depth.ts",
    "fixtures/valid/max-lines-per-function.ts",
    "fixtures/valid/max-lines.ts",
    "fixtures/valid/max-params.ts",
    "fixtures/valid/max-statements.ts",
    "fixtures/valid/public-feature-import.ts",
  ]);
});

test("ARCH-009 fixtures prove Node built-ins are rejected", async () => {
  const fixtures = [
    "bare-node-import.ts",
    "bare-node-inspector.ts",
    "bare-node-internal-http.ts",
    "bare-node-internal-stream.ts",
    "bare-node-internal-tls.ts",
    "node-import.ts",
    "node-sqlite-import.ts",
  ];
  const temporaryDirectory = `/tmp/open-websearch-lint-${crypto.randomUUID()}`;
  const temporaryConfig = `${temporaryDirectory}/.oxlintrc.json`;
  await Bun.$`mkdir ${temporaryDirectory}`.quiet();
  const lintConfig = record(
    Bun.JSONC.parse(await Bun.file(`${repository}/.oxlintrc.jsonc`).text()),
  );
  await Bun.write(temporaryConfig, JSON.stringify({ ...lintConfig, ignorePatterns: [] }));
  try {
    for (const fixture of fixtures) {
      const temporary = `${temporaryDirectory}/${fixture}`;
      await Bun.write(
        temporary,
        await Bun.file(`${repository}/tests/architecture/fixtures/invalid/${fixture}`).text(),
      );
      const child = Bun.spawn(
        ["bun", "x", "oxlint", "--disable-nested-config", "--config", temporaryConfig, temporary],
        { cwd: repository, stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exitCode).not.toBe(0);
      expect(`${stdout}${stderr}`).toContain("no-restricted-imports");
      await Bun.file(temporary).delete();
    }
  } finally {
    await Bun.file(temporaryConfig).delete();
    await Bun.$`rmdir ${temporaryDirectory}`.quiet();
  }
});
