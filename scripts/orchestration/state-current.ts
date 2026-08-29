import type { OrchestrationState } from "./controller-types.ts";

const currentFields = [
  "current_attempt",
  "current_branch",
  "current_worktree",
  "current_base_sha",
  "current_head_sha",
  "current_reviewed_diff",
  "current_step",
  "current_session",
] as const;

/** At most one task may be active, and it must be the one `current_task` names. */
function assertSingleActiveTask(state: OrchestrationState): void {
  const activeTasks = Object.entries(state.tasks)
    .filter(([, task]) => task.state === "in_progress" || task.state === "review")
    .map(([taskId]) => taskId);
  if (activeTasks.length > 1) throw new Error("Only one task may be active");
  if (activeTasks.length === 1 && state.current_task !== activeTasks[0]) {
    throw new Error(`current_task must identify active task ${activeTasks[0]}`);
  }
  if (
    state.current_worktree &&
    (!state.current_worktree.startsWith(`${state.policy.worktree_root}/`) ||
      state.current_worktree.split("/").includes(".."))
  ) {
    throw new Error("current_worktree must be below .worktree");
  }
}

/** The branch, worktree, base SHA, step, and trace must agree with the task identity. */
function assertCurrentFieldsConsistent(state: OrchestrationState, taskId: string): void {
  const expectedAttempt = state.current_attempt;
  if (!hasValidTaskLocation(state, taskId, expectedAttempt) || !hasValidTaskMetadata(state)) {
    throw new Error(`Invalid current task state for ${taskId}`);
  }
}

function hasValidTaskLocation(
  state: OrchestrationState,
  taskId: string,
  attempt: number | undefined,
): boolean {
  return (
    Number.isInteger(attempt) &&
    attempt! >= 1 &&
    state.current_branch === `agent/${taskId.toLowerCase()}-a${attempt}` &&
    state.current_worktree === `${state.policy.worktree_root}/${taskId.toLowerCase()}-a${attempt}` &&
    /^[0-9a-f]{40}$/u.test(state.current_base_sha ?? "") &&
    Number.isInteger(state.current_step) &&
    state.current_step! >= 1 &&
    state.last_trace.startsWith(
      `docs/orchestration/runs/${taskId}/${String(state.current_step).padStart(4, "0")}-`,
    )
  );
}

function hasValidTaskMetadata(state: OrchestrationState): boolean {
  return (
    (state.current_head_sha === undefined || /^[0-9a-f]{40}$/u.test(state.current_head_sha)) &&
    (state.current_reviewed_diff === undefined ||
      /^[0-9a-f]{64}$/u.test(state.current_reviewed_diff)) &&
    (state.current_session === undefined || typeof state.current_session === "string")
  );
}

/** Current-task fields exist only alongside a current task, and must match its ledger. */
export function assertCurrentTask(state: OrchestrationState): void {
  assertSingleActiveTask(state);
  if (state.current_task === undefined) {
    if (currentFields.some((field) => Object.hasOwn(state, field))) {
      throw new Error("Current task fields require current_task");
    }
    return;
  }
  if (typeof state.current_task !== "string" || !state.tasks[state.current_task]) {
    throw new Error(`Unknown current_task ${state.current_task}`);
  }
  const taskId = state.current_task;
  const currentTask = state.tasks[taskId]!;
  assertCurrentFieldsConsistent(state, taskId);
  if (
    !currentTask.attempts?.some(
      (attempt) =>
        attempt.attempt === state.current_attempt &&
        attempt.branch === state.current_branch &&
        attempt.worktree === state.current_worktree &&
        attempt.base_sha === state.current_base_sha,
    )
  ) {
    throw new Error(`Current attempt is missing from ${taskId} attempts`);
  }
  if (!currentTask.evidence.includes(state.last_trace)) {
    throw new Error(`Current trace is missing from ${taskId} evidence`);
  }
}

/** Every spec, evidence, and trace path must be repository-relative and present. */
export async function assertReferencedFiles(
  state: OrchestrationState,
  root: string,
): Promise<void> {
  const references = new Set([
    ...(state.last_trace ? [state.last_trace] : []),
    ...Object.values(state.tasks).flatMap((task) => [task.spec, ...task.evidence]),
  ]);
  for (const reference of references) {
    if (!reference || reference.startsWith("/") || reference.split("/").includes("..")) {
      throw new Error(`Invalid repository-relative path ${reference}`);
    }
    if (!(await Bun.file(`${root}/${reference}`).exists())) {
      throw new Error(`Missing referenced file ${reference}`);
    }
  }
}
