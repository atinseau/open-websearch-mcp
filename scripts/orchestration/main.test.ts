import { afterEach, expect, test } from "bun:test";

const fixtures: string[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await Bun.$`rm -r ${fixture}`.quiet();
  }
});

async function createCliRepository(): Promise<string> {
  const repository = `/tmp/open-websearch-cli-${crypto.randomUUID()}`;
  fixtures.push(repository);
  await Bun.$`mkdir -p ${repository}/bin ${repository}/docs/orchestration/runs/BOOT-001 ${repository}/docs/spec`.quiet();
  await Promise.all([
    Bun.write(`${repository}/.gitignore`, ".worktree/\n"),
    Bun.write(`${repository}/docs/orchestration/runs/BOOT-001/0001-done.md`, "# trace\n"),
    Bun.write(`${repository}/docs/spec/task.md`, "# task\n"),
    Bun.write(
      `${repository}/docs/orchestration/state.toml`,
      `
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "selected-at-runtime"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.BOOT-001]
state = "verified"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["docs"]
evidence = ["docs/orchestration/runs/BOOT-001/0001-done.md"]
[tasks.BOOT-002]
state = "ready"
spec = "docs/spec/task.md"
depends_on = ["BOOT-001"]
write_set = ["scripts"]
evidence = []
`,
    ),
    Bun.write(
      `${repository}/bin/opencode`,
      `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
await Bun.write(Bun.env.CAPTURE!, JSON.stringify(args));
console.log(JSON.stringify({
  type: "text",
  sessionID: "cli-session",
  part: {
    text: 'CONTROLLER_RESULT: {"status":"paused","step":"implementation","summary":"CLI smoke passed","changed_paths":[],"checks":[],"decisions":[],"findings":[],"next_action":"Continue"}'
  }
}));
`,
    ),
  ]);
  await Bun.$`chmod +x ${repository}/bin/opencode`.quiet();
  await Bun.$`git init -b main ${repository}`.quiet();
  await Bun.$`git -C ${repository} add .`.quiet();
  await Bun.$`git -C ${repository} -c user.name=Test -c user.email=test@example.com commit -m base`.quiet();
  return repository;
}

async function invokeCli(
  repository: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const capture = `${repository}/opencode-args.json`;
  const child = Bun.spawn(
    [
      "bun",
      `${import.meta.dir}/main.ts`,
      "--repo",
      repository,
      "--model",
      "openai/test-model",
      "--variant",
      "high",
    ],
    {
      cwd: repository,
      env: { ...Bun.env, PATH: `${repository}/bin:${Bun.env.PATH}`, CAPTURE: capture },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("the CLI invokes OpenCode with explicit model, variant, cwd, and JSON events", async () => {
  const repository = await createCliRepository();
  const capture = `${repository}/opencode-args.json`;
  const { stdout, stderr, exitCode } = await invokeCli(repository);

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout).session_id).toBe("cli-session");
  const args: unknown = await Bun.file(capture).json();
  if (!Array.isArray(args) || !args.every((value) => typeof value === "string")) {
    throw new TypeError("Expected captured OpenCode arguments");
  }
  for (const expected of [
    "run",
    "--format",
    "json",
    "--model",
    "openai/test-model",
    "--variant",
    "high",
    "--dir",
    `${repository}/.worktree/boot-002-a1`,
  ]) {
    expect(args).toContain(expected);
  }
});
