const argumentsByName = new Map<string, string>();
for (let index = 0; index < Bun.argv.length - 1; index += 1) {
  const value = Bun.argv[index];
  const nextValue = Bun.argv[index + 1];
  if (value?.startsWith("--") && nextValue !== undefined) argumentsByName.set(value, nextValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const repository = argumentsByName.get("--repo") ?? process.cwd();
const base = argumentsByName.get("--base");
const head = argumentsByName.get("--head") ?? "HEAD";

if (!base || !/^[0-9a-f]{40}$/u.test(base) || !/^[0-9a-f]{40}$/u.test(head)) {
  throw new Error("Expected full --base and --head Git SHAs");
}

async function run(command: string[], cwd = repository): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${stderr.trim()}\n${stdout.trim()}`);
  }
  return stdout.trim();
}

const allowedFiles = [
  "docs/orchestration/state.toml",
  "package.json",
  "scripts/bootstrap-validator.ts",
];
const allowedDirectories = ["docs/orchestration/runs/BOOT-002/", "scripts/orchestration/"];

const changedPaths = (await run(["git", "diff", "--name-only", `${base}..${head}`]))
  .split("\n")
  .filter(Boolean);
const reviewedHead = await run(["git", "rev-parse", `${head}^`]);
const outsideWriteSet = changedPaths.filter(
  (path) => !allowedFiles.includes(path) && !allowedDirectories.some((dir) => path.startsWith(dir)),
);
if (outsideWriteSet.length > 0) {
  throw new Error(`BOOT-002 changed paths outside its write set: ${outsideWriteSet.join(", ")}`);
}

type State = {
  schema_version?: number;
  last_trace?: string;
  policy?: { max_active_worktrees?: number; worktree_root?: string };
  tasks?: Record<string, { state?: string; evidence?: string[]; acceptance_gates?: string[] }>;
};

const state = Bun.TOML.parse(
  await Bun.file(`${repository}/docs/orchestration/state.toml`).text(),
) as State;
if (
  state.schema_version !== 3 ||
  state.policy?.max_active_worktrees !== 1 ||
  state.policy.worktree_root !== ".worktree" ||
  state.tasks?.["BOOT-002"]?.state !== "verified" ||
  !state.tasks["BOOT-002"].acceptance_gates?.length
) {
  throw new Error("Invalid orchestration state schema");
}

const requiredFiles = [
  "package.json",
  "scripts/orchestration/main.ts",
  "scripts/orchestration/validate.ts",
];
for (const path of requiredFiles) {
  if (!(await Bun.file(`${repository}/${path}`).exists())) throw new Error(`Missing ${path}`);
}

const traces = [
  ...new Bun.Glob("[0-9][0-9][0-9][0-9]-*.md").scanSync({
    cwd: `${repository}/docs/orchestration/runs/BOOT-002`,
    onlyFiles: true,
  }),
].sort();
if (traces.length === 0) throw new Error("BOOT-002 must record at least one Markdown step trace");

const latestName = traces.at(-1);
if (!latestName) throw new Error("BOOT-002 must record a latest Markdown step trace");
const latestTrace = `docs/orchestration/runs/BOOT-002/${latestName}`;
if (state.last_trace !== latestTrace)
  throw new Error("state.toml must point to the latest BOOT-002 trace");

const traceText = await Bun.file(`${repository}/${latestTrace}`).text();
const requiredTraceLabels = [
  "Timestamp",
  "Attempt",
  "Worktree / branch / base SHA / head SHA",
  "OpenCode model / variant / session",
  "Goal",
  "Completed work",
  "Files changed",
  "Commands and outcomes",
  "Decisions and reasons",
  "Findings or blockers",
  "Remaining work",
  "Exact next action",
];
if (
  !/^# Step \d{4} - BOOT-002\b/m.test(traceText) ||
  requiredTraceLabels.some(
    (label) =>
      !traceText
        .split("\n")
        .some((line) => line.startsWith(`- ${label}:`) && line.slice(label.length + 3).trim()),
  )
) {
  throw new Error("Latest BOOT-002 trace is incomplete");
}
if (!state.tasks["BOOT-002"].evidence?.includes(latestTrace)) {
  throw new Error("BOOT-002 state must reference its final trace as evidence");
}

const commandEvidence = traceText.match(/^- Commands and outcomes: (.+)$/mu)?.[1] ?? "";
const findingEvidence = traceText.match(/^- Findings or blockers: (.+)$/mu)?.[1] ?? "";
const worktreeEvidence =
  traceText.match(/^- Worktree \/ branch \/ base SHA \/ head SHA: (.+)$/mu)?.[1] ?? "";
const sessionEvidence =
  traceText.match(/^- OpenCode model \/ variant \/ session: (.+)$/mu)?.[1] ?? "";
const previousTrace =
  traces.length > 1
    ? await Bun.file(`${repository}/docs/orchestration/runs/BOOT-002/${traces.at(-2)}`).text()
    : "";
const previousSession =
  previousTrace.match(/^- OpenCode model \/ variant \/ session: (.+)$/mu)?.[1] ?? "";
const evidenceCommitPaths = (await run(["git", "diff", "--name-only", `${reviewedHead}..${head}`]))
  .split("\n")
  .filter(Boolean);
const failedExit = [...commandEvidence.matchAll(/\bexit(?:ed| code)?\s+(-?\d+)/giu)].some(
  (match) => Number(match[1]) !== 0,
);
if (
  !commandEvidence.includes("bun scripts/orchestration/validate.ts") ||
  !commandEvidence.includes("bun test scripts/orchestration") ||
  !/^# Step \d{4} - BOOT-002 review$/mu.test(traceText) ||
  !/^- Status: verified$/mu.test(traceText) ||
  failedExit ||
  /(?:^|;\s*)(?:blocker|high):/iu.test(findingEvidence) ||
  !worktreeEvidence.includes(base) ||
  !worktreeEvidence.includes(reviewedHead) ||
  evidenceCommitPaths.some(
    (path) => path !== "docs/orchestration/state.toml" && path !== latestTrace,
  ) ||
  /unavailable|not-recorded|not-started/iu.test(sessionEvidence) ||
  sessionEvidence === previousSession
) {
  throw new Error("BOOT-002 final trace does not prove successful validation and fresh review");
}

const tests = [
  ...new Bun.Glob("**/*.test.ts").scanSync({ cwd: `${repository}/scripts/orchestration` }),
  ...new Bun.Glob("**/*.spec.ts").scanSync({ cwd: `${repository}/scripts/orchestration` }),
];
if (tests.length === 0) throw new Error("BOOT-002 must include focused orchestration tests");

const manifest: unknown = await Bun.file(`${repository}/package.json`).json();
if (!isRecord(manifest) || !isRecord(manifest.scripts)) {
  throw new Error("package.json must provide scripts");
}
if (
  manifest.scripts.orchestrate !== "bun scripts/orchestration/main.ts" ||
  manifest.scripts["orchestration:validate"] !== "bun scripts/orchestration/validate.ts"
) {
  throw new Error("package.json must provide the exact orchestration commands");
}

await run(["bun", "scripts/orchestration/validate.ts", "--repo", repository]);
await run(["bun", "test", "scripts/orchestration"]);

console.log(JSON.stringify({ status: "accepted", task: "BOOT-002", changedPaths, traces }));
