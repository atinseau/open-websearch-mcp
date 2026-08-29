import { expect, test } from "bun:test";
import { validateRepository } from "./controller";
import { createRepository } from "./state-fixture";

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
