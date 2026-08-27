const argumentsByName = new Map<string, string>();
for (let index = 0; index < Bun.argv.length - 1; index += 1) {
  const value = Bun.argv[index];
  if (value?.startsWith("--")) argumentsByName.set(value, Bun.argv[index + 1]!);
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

const allowedFiles = ["docs/orchestration/state.toml", "package.json"];
const allowedDirectories = [
  "docs/orchestration/runs/BOOT-002/",
  "scripts/orchestration/",
];

const changedPaths = (await run(["git", "diff", "--name-only", `${base}..${head}`]))
  .split("\n")
  .filter(Boolean);
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
  tasks?: Record<string, { state?: string }>;
};

const state = Bun.TOML.parse(
  await Bun.file(`${repository}/docs/orchestration/state.toml`).text(),
) as State;
if (
  state.schema_version !== 3 ||
  state.policy?.max_active_worktrees !== 1 ||
  state.policy.worktree_root !== ".worktree" ||
  state.tasks?.["BOOT-002"]?.state !== "verified"
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

const traces = [...new Bun.Glob("[0-9][0-9][0-9][0-9]-*.md").scanSync({
  cwd: `${repository}/docs/orchestration/runs/BOOT-002`,
  onlyFiles: true,
})].sort();
if (traces.length === 0) throw new Error("BOOT-002 must record at least one Markdown step trace");

const latestTrace = `docs/orchestration/runs/BOOT-002/${traces.at(-1)}`;
if (state.last_trace !== latestTrace) throw new Error("state.toml must point to the latest BOOT-002 trace");

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
    (label) => !traceText
      .split("\n")
      .some((line) => line.startsWith(`- ${label}:`) && line.slice(label.length + 3).trim()),
  )
) {
  throw new Error("Latest BOOT-002 trace is incomplete");
}

const tests = [
  ...new Bun.Glob("**/*.test.ts").scanSync({ cwd: `${repository}/scripts/orchestration` }),
  ...new Bun.Glob("**/*.spec.ts").scanSync({ cwd: `${repository}/scripts/orchestration` }),
];
if (tests.length === 0) throw new Error("BOOT-002 must include focused orchestration tests");

const manifest = await Bun.file(`${repository}/package.json`).json();
if (
  manifest.scripts?.orchestrate !== "bun scripts/orchestration/main.ts" ||
  manifest.scripts?.["orchestration:validate"] !== "bun scripts/orchestration/validate.ts"
) {
  throw new Error("package.json must provide the exact orchestration commands");
}

await run(["bun", "scripts/orchestration/validate.ts", "--repo", repository]);
await run(["bun", "test", "scripts/orchestration"]);

console.log(JSON.stringify({ status: "accepted", task: "BOOT-002", changedPaths, traces }));
