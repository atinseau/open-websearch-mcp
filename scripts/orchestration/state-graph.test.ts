import { expect, test } from "bun:test";
import { validateRepository } from "./controller";
import { createRepository } from "./state-fixture";

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
