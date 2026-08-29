import { afterEach } from "bun:test";
import { validateRepository } from "./controller";

const fixtures: string[] = [];

export function task(state: Awaited<ReturnType<typeof validateRepository>>, taskId: string) {
  const value = state.tasks[taskId];
  if (!value) throw new Error(`Missing test task ${taskId}`);
  return value;
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await Bun.$`rm -r ${fixture}`.quiet();
  }
});

export async function createRepository(): Promise<string> {
  const repository = `/tmp/open-websearch-controller-${crypto.randomUUID()}`;
  fixtures.push(repository);
  await Bun.$`mkdir -p ${repository}/docs/orchestration/runs/BOOT-001 ${repository}/docs/spec ${repository}/scripts/orchestration`.quiet();
  await Promise.all([
    Bun.write(`${repository}/.gitignore`, ".worktree/\n"),
    Bun.write(`${repository}/docs/orchestration/runs/BOOT-001/0001-done.md`, "# trace\n"),
    Bun.write(`${repository}/docs/spec/task.md`, "# task\n"),
    Bun.write(`${repository}/scripts/orchestration/validate.ts`, "console.log('valid');\n"),
    Bun.write(
      `${repository}/scripts/orchestration/smoke.test.ts`,
      "import { expect, test } from 'bun:test'; test('smoke', () => expect(true).toBe(true));\n",
    ),
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
acceptance_gates = ["command:bun test scripts/orchestration"]
evidence = []
[tasks.BOOT-003]
state = "planned"
spec = "docs/spec/task.md"
depends_on = ["BOOT-002"]
write_set = ["scripts"]
evidence = []
`,
    ),
  ]);
  await Bun.$`git init -b main ${repository}`.quiet();
  await Bun.$`git -C ${repository} add .`.quiet();
  await Bun.$`git -C ${repository} -c user.name=Test -c user.email=test@example.com commit -m base`.quiet();
  return repository;
}
