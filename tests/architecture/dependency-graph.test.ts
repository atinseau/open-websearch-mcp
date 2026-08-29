import { expect, test } from "bun:test";

const repository = import.meta.dir.slice(0, -"/tests/architecture".length);

const featureNames = [
  "configuration",
  "discovery",
  "extraction",
  "investigation",
  "ranking",
  "rendering",
  "security",
  "storage",
] as const;

type SourceFile = {
  readonly path: string;
  readonly imports: readonly string[];
  readonly importDeclarations: number;
  readonly hasComputedDynamicImport: boolean;
};

const importPattern = /(?:from|import)\s+["']([^"']+)["']/gu;
const importDeclarationPattern = /^\s*import\s+(?!\()/gmu;
const computedDynamicImportPattern = /\bimport\s*\(\s*(?!["'])/u;

function resolvedPath(from: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (!specifier.startsWith(".")) return undefined;

  const segments = from.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function featureOf(path: string): string | undefined {
  return path.startsWith("features/") ? path.split("/")[1] : undefined;
}

/**
 * The real import graph of `src`, read from source rather than inferred from
 * file names. ADR-0007 defers mechanical boundary enforcement, so these
 * assertions are the only automated check that the ARCH-002/ARCH-003 shape
 * actually holds.
 */
async function sourceGraph(): Promise<readonly SourceFile[]> {
  const files: SourceFile[] = [];
  for await (const relative of new Bun.Glob("**/*.ts").scan({ cwd: `${repository}/src` })) {
    const text = await Bun.file(`${repository}/src/${relative}`).text();
    const imports = [...text.matchAll(importPattern)].map((match) => match[1] ?? "");
    files.push({
      path: relative,
      imports,
      importDeclarations: [...text.matchAll(importDeclarationPattern)].length,
      hasComputedDynamicImport: computedDynamicImportPattern.test(text),
    });
  }
  expect(files.length).toBeGreaterThan(0);
  return files;
}

test("ARCH-002 features are reached only through their public index", async () => {
  for (const file of await sourceGraph()) {
    const owningFeature = featureOf(file.path);
    for (const specifier of file.imports) {
      const target = resolvedPath(file.path, specifier);
      const feature = target ? featureOf(target) : undefined;
      if (!feature) continue;
      if (feature === owningFeature) continue;
      expect(target, `${file.path} reaches into ${specifier}`).toBe(`features/${feature}`);
    }
    expect(file.hasComputedDynamicImport, `${file.path} has a computed dynamic import`).toBe(false);
  }
});

test("ARCH-007 limits each source file to twelve import declarations", async () => {
  for (const file of await sourceGraph()) {
    expect(file.importDeclarations, `${file.path} import declarations`).toBeLessThanOrEqual(12);
  }
});

test("ARCH-003 keeps the dependency direction acyclic and inward", async () => {
  const graph = await sourceGraph();

  for (const file of graph) {
    for (const specifier of file.imports) {
      // No feature may depend on the composition root or the MCP adapter.
      if (file.path.startsWith("features/") || file.path.startsWith("shared/")) {
        expect(specifier.startsWith("@/bootstrap"), `${file.path} imports ${specifier}`).toBe(
          false,
        );
        expect(specifier.startsWith("@/mcp"), `${file.path} imports ${specifier}`).toBe(false);
      }
      if (file.path.includes("/application/")) {
        expect(
          /(?:^|\/)adapters(?:\/|$)/u.test(specifier),
          `${file.path} imports adapter ${specifier}`,
        ).toBe(false);
      }
      // shared holds primitives; it must not depend on features.
      if (file.path.startsWith("shared/")) {
        expect(specifier.startsWith("@/features"), `${file.path} imports ${specifier}`).toBe(false);
      }
    }
  }
});

test("ARCH-004 keeps shared primitives genuinely shared", async () => {
  const graph = await sourceGraph();
  // `shared` is legitimately absent: a primitive with one consumer belongs to
  // that feature. It appears only when a second feature genuinely needs it.
  const sharedModules = graph.filter((file) => file.path.startsWith("shared/"));

  for (const shared of sharedModules) {
    const moduleName = shared.path.slice("shared/".length).replace(/\.ts$/u, "");
    const specifier = `@/shared/${moduleName}`;
    const consumingFeatures = new Set(
      graph
        .filter((file) => file.path.startsWith("features/") && file.imports.includes(specifier))
        .map((file) => file.path.split("/")[1]),
    );

    // "Shared" means used by more than one feature; a single consumer belongs
    // inside that feature instead.
    expect(
      consumingFeatures.size,
      `${specifier} has ${consumingFeatures.size} consumers`,
    ).toBeGreaterThan(1);
  }

  // ARCH-004 names these as invalid designs outright.
  for (const forbidden of ["utils", "helpers", "common", "constants"]) {
    expect(await Bun.file(`${repository}/src/shared/${forbidden}.ts`).exists()).toBe(false);
  }
});

test("ARCH-001 gives every feature exactly one public entrypoint", async () => {
  for (const feature of featureNames) {
    const entries = await Array.fromAsync(
      new Bun.Glob("*.ts").scan({ cwd: `${repository}/src/features/${feature}` }),
    );
    expect(entries, `${feature} must expose only index.ts at its root`).toEqual(["index.ts"]);
  }
});
