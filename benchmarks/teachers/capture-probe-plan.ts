import { requiredDate } from "./contract-json.ts";
import { teacherCases } from "./contract.ts";
import { assertRefreshWritable } from "./refresh-lifecycle.ts";
import { ensureRefreshInputs } from "./refresh-inputs.ts";
import { canonicalExecutable, commandOutput } from "./process-controls.ts";
import { captureOutputExists, type CaptureTarget } from "./capture-probe-publication.ts";

/** A resolved probe: where it writes, what it runs, and which case it answers. */
export type ProbePlan = {
  root: string;
  target: CaptureTarget;
  teacherCase: { id: string; locale: string; question: string } | undefined;
  promptTemplate: string;
  binary: string;
  allowedChildExecutable: string;
  cliVersion: string;
  temporaryRoot: string;
};

/**
 * Resolves one probe before any process runs: validates the date, loads refresh
 * inputs, locates the requested case, refuses a date whose corpus is sealed or
 * whose output already exists, and canonicalizes the executables it may run.
 */
export async function planProbe(input: {
  root: string;
  provider: "codex";
  caseId: string | undefined;
  date: string;
}): Promise<ProbePlan> {
  const { root, provider, caseId, date } = input;
  requiredDate(date, "capture date");
  const refreshInputs = await ensureRefreshInputs(root, date);
  const cases = teacherCases(refreshInputs.corpus);
  const teacherCase = caseId === undefined ? undefined : cases.find((item) => item.id === caseId);
  if (caseId !== undefined && teacherCase === undefined) throw new Error(`unknown case: ${caseId}`);
  await assertRefreshWritable(root, date);
  const output =
    teacherCase === undefined
      ? `${root}/runs/${date}/probes/${provider}`
      : `${root}/runs/${date}/cases/${teacherCase.id}/${provider}`;
  const target: CaptureTarget = { root, date, provider, caseId: teacherCase?.id, output };
  if (await captureOutputExists(target)) {
    throw new Error(`immutable probe already exists: ${output}`);
  }

  const binary = await canonicalExecutable(provider);
  const allowedChildExecutable = await canonicalExecutable("codex-code-mode-host");
  const cliVersion = await commandOutput([binary, "--version"]);
  const temporaryRoot = await commandOutput([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/spk-001-${provider}.XXXXXX`,
  ]);
  return {
    root,
    target,
    teacherCase,
    promptTemplate: refreshInputs.prompt,
    binary,
    allowedChildExecutable,
    cliVersion,
    temporaryRoot,
  };
}
