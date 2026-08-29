import type { ControllerOptions, OrchestrationState, Task } from "./controller-types.ts";
import { persistPrepare } from "./step-trace.ts";
import { reconcileTraceIntoState } from "./controller-reconcile.ts";
import { validateRepository } from "./state-validate.ts";

export async function readLatestTrace(
  worktree: string,
  taskId: string,
): Promise<{ latestName: string; latestStep: number }> {
  const traceNames = [
    ...new Bun.Glob("[0-9][0-9][0-9][0-9]-*.md").scanSync({
      cwd: `${worktree}/docs/orchestration/runs/${taskId}`,
    }),
  ].sort();
  const latestName = traceNames.at(-1);
  if (!latestName) throw new Error(`Active task ${taskId} has no durable trace`);
  return { latestName, latestStep: Number(latestName.slice(0, 4)) };
}

/**
 * Folds any unrecorded trace back into the ledger and runs the prepare step when
 * the task is merely ready, so the caller sees a task in its true state.
 */
export async function catchUpWorktreeLedger(input: {
  activePath: string;
  repository: string;
  options: ControllerOptions;
  state: OrchestrationState;
  task: Task;
  identity: {
    taskId: string;
    attempt: number;
    relativeWorktree: string;
    worktree: string;
    branch: string;
    baseSha: string;
  };
}): Promise<{ state: OrchestrationState; task: Task; latestTrace: string }> {
  const { activePath, repository, options, identity } = input;
  const { taskId, attempt, relativeWorktree, worktree, branch, baseSha } = identity;
  let state = input.state;
  let task = input.task;
  const { latestName, latestStep } = await readLatestTrace(worktree, taskId);
  let latestTrace = await Bun.file(
    `${worktree}/docs/orchestration/runs/${taskId}/${latestName}`,
  ).text();
  if (latestStep > (state.current_step ?? 0)) {
    await reconcileTraceIntoState({
      activePath,
      taskId,
      task,
      baseSha,
      latestName,
      latestTrace,
      latestStep,
    });
    state = await validateRepository(activePath);
    task = state.tasks[taskId]!;
  }
  if (task.state === "ready") {
    latestTrace = await persistPrepare({
      repository,
      worktree: activePath,
      taskId,
      attempt,
      relativeWorktree,
      branch,
      baseSha,
      model: options.model,
      variant: options.variant,
      timeoutMs: state.policy.agent_timeout_minutes * 60_000,
    });
    state = await validateRepository(activePath);
    task = state.tasks[taskId]!;
  }
  return { state, task, latestTrace };
}
