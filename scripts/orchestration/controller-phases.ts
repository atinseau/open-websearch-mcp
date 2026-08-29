import type {
  ControllerOptions,
  OpenCodeRequest,
  OpenCodeStepResult,
  OrchestrationState,
  StepStatus,
  Task,
  TaskState,
  WorktreeRecord,
} from "./controller-types.ts";
import {
  assertDependencyGraph,
  assertPolicy,
  assertReadiness,
  assertRootShape,
  assertTaskShapes,
} from "./state-schema.ts";
import { assertCurrentTask, assertReferencedFiles } from "./state-current.ts";
import { nextStepNumber, persistPrepare } from "./step-trace.ts";
import { run } from "./process-utils.ts";
import {
  createPrompt,
  executeAndValidateStep,
  resolveActiveTask,
  startNextReadyTask,
} from "./controller-task-step.ts";
import {
  assertWorktreeModelMatches,
  pausedForIntegration,
  reconcileTraceIntoState,
  reconcileVerifiedTask,
  recoverWorktreeState,
} from "./controller-reconcile.ts";
import { persistControllerStep } from "./controller-step-persistence.ts";

export type {
  ControllerOptions,
  OpenCodeRequest,
  OpenCodeStepResult,
  OrchestrationState,
  StepStatus,
  Task,
  TaskState,
  WorktreeRecord,
};

/** Reads and fully validates the orchestration ledger before any step runs. */
export async function validateRepository(repository: string): Promise<OrchestrationState> {
  const root = repository.replace(/[/]$/u, "");
  // The complete schema is checked by the assertions below before this value escapes.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = Bun.TOML.parse(
    await Bun.file(`${root}/docs/orchestration/state.toml`).text(),
  ) as OrchestrationState;

  assertRootShape(state);
  assertPolicy(state);
  assertTaskShapes(state);
  assertDependencyGraph(state);
  assertReadiness(state);
  assertCurrentTask(state);
  await assertReferencedFiles(state, root);
  return state;
}

type ControllerStepContext = {
  repository: string;
  rootState: OrchestrationState;
  state: OrchestrationState;
};

async function readWorktreeRecords(repository: string): Promise<WorktreeRecord[]> {
  return (await run(["git", "worktree", "list", "--porcelain"], repository))
    .split("\n\n")
    .map((record) =>
      Object.fromEntries(
        record.split("\n").map((line) => {
          const separator = line.indexOf(" ");
          return separator === -1
            ? [line, ""]
            : [line.slice(0, separator), line.slice(separator + 1)];
        }),
      ),
    )
    .filter((record) => record.worktree);
}

async function establishRootContext(options: ControllerOptions): Promise<ControllerStepContext> {
  const repository = options.repository.replace(/\/$/u, "");
  const branch = await run(["git", "branch", "--show-current"], repository);
  if (branch !== "main") throw new Error(`Controller root must be factual main, found ${branch}`);
  if (await run(["git", "status", "--porcelain"], repository)) {
    throw new Error("Controller root main must be clean");
  }
  const rootState = await validateRepository(repository);
  const model = rootState.environment.controller_model;
  if (model !== "selected-at-runtime" && model !== options.model) {
    throw new Error(`Controller model is fixed to ${String(model)}`);
  }
  const variant = rootState.environment.controller_variant ?? "default";
  if (typeof variant !== "string") throw new Error("Controller variant must be a string");
  if (model !== "selected-at-runtime" && variant !== (options.variant ?? "default")) {
    throw new Error(`Controller variant is fixed to ${variant}`);
  }
  return { repository, rootState, state: rootState };
}

async function readLatestTrace(
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
async function catchUpWorktreeLedger(input: {
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

type ResumedWorktree = {
  state: OrchestrationState;
  taskId: string;
  task: Task;
  attempt: number;
  relativeWorktree: string;
  worktree: string;
  branch: string;
  baseSha: string;
  latestTrace: string;
  stepNumber: number;
  previousTaskState: TaskState;
  previousSessionId: string | undefined;
  sessionId: string | undefined;
};

async function loadActiveWorktreeState(input: {
  active: WorktreeRecord;
  rootRecord: WorktreeRecord | undefined;
  rootState: OrchestrationState;
  options: ControllerOptions;
  repository: string;
}): Promise<{ activePath: string; state: OrchestrationState }> {
  const { active, rootRecord, rootState, options, repository } = input;
  const activePath = active.worktree;
  if (!activePath) throw new Error("Active worktree record has no path");
  if (
    !rootRecord ||
    !activePath.startsWith(`${rootRecord.worktree}/${rootState.policy.worktree_root}/`)
  ) {
    throw new Error(`Worktree is outside ${rootState.policy.worktree_root}: ${activePath}`);
  }
  let state = await validateRepository(activePath);
  if (await recoverWorktreeState({ activePath, active, rootState, state, options, repository })) {
    state = await validateRepository(activePath);
  }
  return { activePath, state };
}

/**
 * Reconciles the one active worktree back to a runnable step. Returns a
 * finished result when the task is already integrated or awaits integration.
 */
type ResumeActiveWorktreeInput = {
  active: WorktreeRecord;
  rootRecord: WorktreeRecord | undefined;
  rootState: OrchestrationState;
  options: ControllerOptions;
  repository: string;
  forceFreshSession: boolean;
};

async function resumeActiveWorktree(
  input: ResumeActiveWorktreeInput,
): Promise<ResumedWorktree | { finished: OpenCodeStepResult }> {
  const { active, rootRecord, rootState, options, repository, forceFreshSession } = input;
  const loaded = await loadActiveWorktreeState({
    active,
    rootRecord,
    rootState,
    options,
    repository,
  });
  const { activePath } = loaded;
  let { state } = loaded;
  const resumed = resolveActiveTask(state, rootState, active, repository);
  const { taskId, attempt, relativeWorktree, worktree, branch, baseSha } = resumed;
  const caught = await catchUpWorktreeLedger({
    activePath,
    repository,
    options,
    state,
    task: resumed.task,
    identity: resumed,
  });
  ({ state } = caught);
  let task = caught.task;
  const latestTrace = caught.latestTrace;
  if (task.state === "verified") {
    const reconciled = await reconcileVerifiedTask({
      activePath,
      repository,
      taskId,
      state,
      rootState,
    });
    const finished =
      reconciled === "merged"
        ? await runControllerStep(options)
        : pausedForIntegration(taskId, state);
    return { finished };
  }
  assertWorktreeModelMatches(state, options);
  return {
    state,
    taskId,
    task,
    attempt,
    relativeWorktree,
    worktree,
    branch,
    baseSha,
    latestTrace,
    stepNumber: await nextStepNumber(worktree, taskId),
    previousTaskState: task.state,
    previousSessionId: state.current_session,
    sessionId: task.state === "review" || forceFreshSession ? undefined : state.current_session,
  };
}

async function startControllerWorktree(
  rootState: OrchestrationState,
  options: ControllerOptions,
  repository: string,
): Promise<ResumedWorktree> {
  const started = await startNextReadyTask(rootState, options, repository);
  const state = await validateRepository(started.worktree);
  const task = state.tasks[started.taskId]!;
  return {
    state,
    task,
    ...started,
    stepNumber: await nextStepNumber(started.worktree, started.taskId),
    previousTaskState: task.state,
    previousSessionId: undefined,
    sessionId: undefined,
  };
}

async function resolveControllerWorktree(input: {
  rootState: OrchestrationState;
  options: ControllerOptions;
  repository: string;
  forceFreshSession: boolean;
}): Promise<ResumedWorktree | { finished: OpenCodeStepResult }> {
  const records = await readWorktreeRecords(input.repository);
  const [rootRecord, ...worktreeRecords] = records;
  if (worktreeRecords.length > 1) throw new Error("Only one implementation worktree may be active");
  const active = worktreeRecords[0];
  return active
    ? resumeActiveWorktree({ ...input, active, rootRecord })
    : startControllerWorktree(input.rootState, input.options, input.repository);
}

function createStepRequest(step: ResumedWorktree, options: ControllerOptions): OpenCodeRequest {
  return {
    task: step.taskId,
    cwd: step.worktree,
    model: options.model,
    variant: options.variant,
    session_id: step.sessionId,
    prompt: createPrompt(step.taskId, step.task, step.latestTrace),
    timeout_ms: step.state.policy.agent_timeout_minutes * 60_000,
  };
}

export async function runControllerStep(
  options: ControllerOptions,
  forceFreshSession = false,
): Promise<OpenCodeStepResult> {
  const { repository, rootState } = await establishRootContext(options);
  const step = await resolveControllerWorktree({
    rootState,
    options,
    repository,
    forceFreshSession,
  });
  if ("finished" in step) return step.finished;
  const request = createStepRequest(step, options);
  const result = await executeAndValidateStep({
    options,
    request,
    task: step.task,
    taskId: step.taskId,
    worktree: step.worktree,
    baseSha: step.baseSha,
    previousTaskState: step.previousTaskState,
    previousSessionId: step.previousSessionId,
  });
  await persistControllerStep({ step, options, request, result });
  return result;
}
