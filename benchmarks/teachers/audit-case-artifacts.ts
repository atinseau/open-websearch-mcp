export async function assertKnownCaseArtifacts(
  root: string,
  date: string,
  caseIds: string[],
): Promise<void> {
  const expected = new Set(caseIds);
  for (const scope of ["fixtures", "runs"] as const)
    await assertScopeArtifacts(root, date, scope, expected);
}

async function assertScopeArtifacts(
  root: string,
  date: string,
  scope: "fixtures" | "runs",
  expected: Set<string>,
): Promise<void> {
  const base = `${root}/${scope}/${date}`;
  const casePaths = await Array.fromAsync(
    new Bun.Glob("cases/**/*").scan({ cwd: base, onlyFiles: true }),
  );
  for (const path of casePaths) assertKnownCasePath(scope, path, expected);
  const failurePaths = await Array.fromAsync(
    new Bun.Glob("failures/**/*").scan({ cwd: base, onlyFiles: true }),
  );
  const series = failureSeries(failurePaths);
  for (const path of failurePaths) assertKnownFailurePath(scope, path, expected, series);
}

function assertKnownCasePath(scope: string, path: string, expected: Set<string>): void {
  const caseId = path.split("/")[1];
  if (caseId === undefined || !expected.has(caseId))
    throw new Error(`unexpected ${scope} case artifact: ${path}`);
}

function failureSeries(paths: string[]): Set<string> {
  return new Set(
    paths.flatMap((path) => {
      const segments = path.split("/").slice(1);
      return segments.includes("cases") && segments[0] !== undefined ? [segments[0]] : [];
    }),
  );
}

function assertKnownFailurePath(
  scope: string,
  path: string,
  expected: Set<string>,
  series: Set<string>,
): void {
  const segments = path.split("/").slice(1);
  const nestedCases = segments.indexOf("cases");
  const caseId = nestedCases === -1 ? segments[0] : segments[nestedCases + 1];
  if (caseId === "probe") return;
  if (
    caseId === undefined ||
    (!expected.has(caseId) && !(nestedCases === -1 && series.has(caseId)))
  )
    throw new Error(`unexpected ${scope} failure case artifact: ${path}`);
}
