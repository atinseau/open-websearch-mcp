import type { OrchestrationState, Task, TaskState } from "./controller-types.ts";

const rootFields = new Set([
  "schema_version",
  "project",
  "state",
  "spec_revision",
  "current_task",
  "current_attempt",
  "current_worktree",
  "current_branch",
  "current_base_sha",
  "current_session",
  "current_step",
  "current_head_sha",
  "current_reviewed_diff",
  "last_trace",
  "environment",
  "artifacts",
  "policy",
  "tasks",
]);

const policyFields = new Set([
  "max_active_worktrees",
  "max_step_retries",
  "agent_timeout_minutes",
  "trace_after_every_step",
  "worktree_root",
]);

const taskFields = new Set([
  "state",
  "spec",
  "depends_on",
  "write_set",
  "evidence",
  "requirements",
  "acceptance_gates",
  "attempts",
]);

const taskStates = new Set<TaskState>([
  "planned",
  "ready",
  "in_progress",
  "review",
  "verified",
  "blocked_external",
]);

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasRequiredRootFields(state: OrchestrationState): boolean {
  return (
    state.schema_version === 3 &&
    typeof state.project === "string" &&
    Boolean(state.project) &&
    ["bootstrapped", "active", "complete", "blocked_external"].includes(state.state) &&
    typeof state.spec_revision === "string" &&
    typeof state.last_trace === "string"
  );
}

function hasRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasStateCollections(state: OrchestrationState): boolean {
  return hasRecord(state.environment) && hasRecord(state.artifacts) && hasRecord(state.tasks);
}

/** Rejects a document whose required root shape is not a valid state file. */
export function assertRootShape(state: OrchestrationState): void {
  if (!hasRequiredRootFields(state) || !hasStateCollections(state)) {
    throw new Error("Invalid orchestration state");
  }
  const unknownRoot = Object.keys(state).find((field) => !rootFields.has(field));
  if (unknownRoot) throw new Error(`Unknown orchestration state field ${unknownRoot}`);
}

/** The loop depends on exactly one worktree below `.worktree` and mandatory traces. */
export function assertPolicy(state: OrchestrationState): void {
  const unknownPolicy = Object.keys(state.policy).find((field) => !policyFields.has(field));
  if (unknownPolicy) throw new Error(`Unknown orchestration policy field ${unknownPolicy}`);
  if (
    state.policy?.max_active_worktrees !== 1 ||
    state.policy.worktree_root !== ".worktree" ||
    !Number.isInteger(state.policy.max_step_retries) ||
    state.policy.max_step_retries < 1 ||
    !Number.isFinite(state.policy.agent_timeout_minutes) ||
    state.policy.agent_timeout_minutes <= 0 ||
    // TOML input is untyped at runtime; truthy non-booleans must not satisfy the trace policy.
    // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare
    state.policy.trace_after_every_step !== true
  ) {
    throw new Error("Policy requires one active worktree under .worktree");
  }
}

function hasValidAcceptanceGates(task: Task): boolean {
  if (task.acceptance_gates === undefined) return true;
  return (
    Array.isArray(task.acceptance_gates) &&
    task.acceptance_gates.every(
      (value) =>
        typeof value === "string" &&
        Boolean(value.trim()) &&
        (!value.startsWith("command:") || Boolean(value.slice("command:".length).trim())),
    )
  );
}

function hasValidAttempts(task: Task): boolean {
  if (task.attempts === undefined) return true;
  return (
    Array.isArray(task.attempts) &&
    !task.attempts.some(
      (attempt) =>
        !attempt ||
        !Number.isInteger(attempt.attempt) ||
        attempt.attempt < 1 ||
        typeof attempt.branch !== "string" ||
        typeof attempt.worktree !== "string" ||
        !/^[0-9a-f]{40}$/u.test(attempt.base_sha),
    )
  );
}

function hasRequiredTaskFields(task: Task): boolean {
  return (
    taskStates.has(task.state) &&
    typeof task.spec === "string" &&
    isStringArray(task.depends_on) &&
    isStringArray(task.write_set) &&
    isStringArray(task.evidence)
  );
}

function hasOptionalTaskFields(task: Task): boolean {
  return (
    (task.requirements === undefined || isStringArray(task.requirements)) &&
    hasValidAcceptanceGates(task) &&
    hasValidAttempts(task)
  );
}

/** Every task must carry a well-formed record before the graph is interpreted. */
export function assertTaskShapes(state: OrchestrationState): void {
  for (const [taskId, task] of Object.entries(state.tasks)) {
    for (const field of Object.keys(task)) {
      if (!taskFields.has(field)) throw new Error(`${taskId} has unknown field ${field}`);
    }
    if (!hasRequiredTaskFields(task) || !hasOptionalTaskFields(task)) {
      throw new Error(`${taskId} has invalid task fields`);
    }
  }
}

/** A dependency may not be unknown, and the graph may not contain a cycle. */
export function assertDependencyGraph(state: OrchestrationState): void {
  const visited = new Set<string>();
  const visiting: string[] = [];
  const visit = (taskId: string): void => {
    const cycleStart = visiting.indexOf(taskId);
    if (cycleStart !== -1) {
      throw new Error(`Dependency cycle: ${[...visiting.slice(cycleStart), taskId].join(" -> ")}`);
    }
    if (visited.has(taskId)) return;

    visiting.push(taskId);
    for (const dependency of state.tasks[taskId]?.depends_on ?? []) {
      if (!Object.hasOwn(state.tasks, dependency)) {
        throw new Error(`${taskId} depends on unknown task ${dependency}`);
      }
      visit(dependency);
    }
    visiting.pop();
    visited.add(taskId);
  };
  for (const taskId of Object.keys(state.tasks)) visit(taskId);
}

/** Readiness and activity both require every dependency to be verified first. */
export function assertReadiness(state: OrchestrationState): void {
  if (state.state === "complete") {
    const openTask = Object.entries(state.tasks).find(([, task]) => task.state !== "verified");
    if (openTask) {
      throw new Error(
        `Project cannot be complete while task ${openTask[0]} is ${openTask[1].state}`,
      );
    }
  }
  for (const [taskId, task] of Object.entries(state.tasks)) {
    if (task.state !== "ready") continue;
    const unverified = task.depends_on.find(
      (dependency) => state.tasks[dependency]?.state !== "verified",
    );
    if (unverified) throw new Error(`Ready task ${taskId} has unverified dependency ${unverified}`);
  }
  for (const [taskId, task] of Object.entries(state.tasks)) {
    if (task.state !== "in_progress" && task.state !== "review") continue;
    const unverified = task.depends_on.find(
      (dependency) => state.tasks[dependency]?.state !== "verified",
    );
    if (unverified) {
      throw new Error(`Active task ${taskId} has unverified dependency ${unverified}`);
    }
  }
}
