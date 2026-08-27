import { afterEach, expect, test } from "bun:test";
import { validateRepository } from "./controller";

const fixtures: string[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await Bun.$`rm -r ${fixture}`.quiet();
  }
});

async function createRepository(state: string): Promise<string> {
  const repository = `/tmp/open-websearch-state-${crypto.randomUUID()}`;
  fixtures.push(repository);
  await Bun.$`mkdir -p ${repository}/docs/orchestration/runs/BOOT-001 ${repository}/docs/spec`.quiet();
  await Promise.all([
    Bun.write(`${repository}/docs/orchestration/state.toml`, state),
    Bun.write(`${repository}/docs/orchestration/runs/BOOT-001/0001-done.md`, "# trace\n"),
    Bun.write(`${repository}/docs/spec/task.md`, "# task\n"),
  ]);
  return repository;
}

test("validateRepository accepts a coherent single-task state", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"

[environment]
controller_model = "openai/test"

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
write_set = ["scripts/orchestration"]
evidence = ["docs/orchestration/runs/BOOT-001/0001-done.md"]
`);

  const state = await validateRepository(repository);

  expect(state.tasks["BOOT-001"]?.state).toBe("verified");
});

test("validateRepository rejects a dependency cycle", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"

[environment]
controller_model = "openai/test"

[artifacts]

[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"

[tasks.A]
state = "planned"
spec = "docs/spec/task.md"
depends_on = ["B"]
write_set = ["a"]
evidence = []

[tasks.B]
state = "planned"
spec = "docs/spec/task.md"
depends_on = ["A"]
write_set = ["b"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow("Dependency cycle: A -> B -> A");
});

test("validateRepository rejects an unknown dependency", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "planned"
spec = "docs/spec/task.md"
depends_on = ["MISSING"]
write_set = ["a"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow("A depends on unknown task MISSING");
});

test("validateRepository rejects more than one active task", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
current_task = "A"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "in_progress"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
[tasks.B]
state = "review"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["b"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow("Only one task may be active");
});

test("validateRepository rejects unknown task fields", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "planned"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
typo = true
`);

  expect(validateRepository(repository)).rejects.toThrow("A has unknown field typo");
});

test("validateRepository requires referenced specs, traces, and evidence", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/MISSING.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "verified"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = ["docs/orchestration/runs/ALSO-MISSING.md"]
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "Missing referenced file docs/orchestration/runs/MISSING.md",
  );
});

test("validateRepository rejects a ready task with an unverified dependency", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "planned"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
[tasks.B]
state = "ready"
spec = "docs/spec/task.md"
depends_on = ["A"]
write_set = ["b"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "Ready task B has unverified dependency A",
  );
});

test("validateRepository enforces the single repository-local worktree policy", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 2
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = "/tmp/worktrees"
[tasks.A]
state = "verified"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "Policy requires one active worktree under .worktree",
  );
});

test("validateRepository requires current_task to identify the active task", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
current_task = "B"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "in_progress"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
[tasks.B]
state = "planned"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["b"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "current_task must identify active task A",
  );
});

test("validateRepository confines the recorded worktree to .worktree", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
current_task = "A"
current_worktree = "../sibling"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "in_progress"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "current_worktree must be below .worktree",
  );
});

test("validateRepository rejects malformed task fields", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "done"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow("A has invalid task fields");
});

test("validateRepository rejects complete state while work remains", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "complete"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.A]
state = "planned"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = []
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "Project cannot be complete while task A is planned",
  );
});

test("validateRepository rejects current fields without a current task", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
current_branch = "agent/boot-001-a1"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
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
write_set = ["a"]
evidence = ["docs/orchestration/runs/BOOT-001/0001-done.md"]
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "Current task fields require current_task",
  );
});

test("validateRepository rejects empty acceptance gate commands", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
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
write_set = ["a"]
acceptance_gates = ["command: "]
evidence = ["docs/orchestration/runs/BOOT-001/0001-done.md"]
`);

  expect(validateRepository(repository)).rejects.toThrow("BOOT-001 has invalid task fields");
});

test("validateRepository requires the current attempt in task history", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
current_task = "BOOT-001"
current_attempt = 1
current_branch = "agent/boot-001-a1"
current_worktree = ".worktree/boot-001-a1"
current_base_sha = "1111111111111111111111111111111111111111"
current_step = 1
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.BOOT-001]
state = "in_progress"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
attempts = []
evidence = ["docs/orchestration/runs/BOOT-001/0001-done.md"]
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "Current attempt is missing from BOOT-001 attempts",
  );
});

test("validateRepository rejects a truthy non-boolean trace policy", async () => {
  const repository = await createRepository(`
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "openai/test"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = "false"
worktree_root = ".worktree"
[tasks.BOOT-001]
state = "verified"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["a"]
evidence = ["docs/orchestration/runs/BOOT-001/0001-done.md"]
`);

  expect(validateRepository(repository)).rejects.toThrow(
    "Policy requires one active worktree under .worktree",
  );
});
