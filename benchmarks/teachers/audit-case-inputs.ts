import { array, record, requiredString } from "./contract-json.ts";
import { readRefreshInputs } from "./refresh-inputs.ts";
import type { TeacherCase } from "./audit-case-policy.ts";

export async function readAuditInputs(
  root: string,
  date: string,
): Promise<{ corpus: unknown; prompt: string; legacy: boolean }> {
  const inputDirectory = `${root}/runs/${date}/inputs`;
  const corpusExists = await Bun.file(`${inputDirectory}/corpus.json`).exists();
  const promptExists = await Bun.file(`${inputDirectory}/prompt.md`).exists();
  if (corpusExists !== promptExists) throw new Error(`incomplete audit input snapshot: ${date}`);
  if (corpusExists) return { ...(await readRefreshInputs(root, date)), legacy: false };

  const manifestPath = `${root}/runs/${date}/manifest.json`;
  if (!(await Bun.file(manifestPath).exists()))
    throw new Error(`missing audit input snapshot: ${date}`);
  const manifest = record(await Bun.file(manifestPath).json(), "legacy teacher manifest");
  const artifacts = array(manifest.artifacts, "legacy teacher manifest artifacts");
  if (
    artifacts.some((artifact) =>
      String(record(artifact, "legacy teacher manifest artifact").path).startsWith(
        `runs/${date}/inputs/`,
      ),
    )
  ) {
    throw new Error(`missing audit input snapshot: ${date}`);
  }
  return {
    corpus: undefined,
    prompt: "",
    legacy: true,
  };
}

export async function legacyTeacherCases(root: string, date: string): Promise<TeacherCase[]> {
  const cases: TeacherCase[] = [];
  for await (const path of new Bun.Glob("*/fixture.json").scan({
    cwd: `${root}/fixtures/${date}/cases`,
    onlyFiles: true,
  })) {
    const fixture = record(
      await Bun.file(`${root}/fixtures/${date}/cases/${path}`).json(),
      "legacy teacher fixture",
    );
    cases.push({
      id: requiredString(fixture.case_id, "legacy fixture case_id"),
      locale: requiredString(fixture.locale, "legacy fixture locale"),
      question: requiredString(fixture.question, "legacy fixture question"),
    });
  }
  cases.sort((left, right) => left.id.localeCompare(right.id));
  if (cases.length !== 20)
    throw new Error(`legacy corpus must contain 20 cases, got ${cases.length}`);
  return cases;
}

/**
 * The sealed pre-ADR-0006 refresh retains both teachers; current refreshes are
 * Codex-only.
 */
export function auditedProviders(legacy: boolean): ("codex" | "claude")[] {
  return legacy ? ["codex", "claude"] : ["codex"];
}
