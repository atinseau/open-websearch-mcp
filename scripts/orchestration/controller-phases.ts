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
  assertWorktreeModelMatches,
  pausedForIntegration,
  reconcileTraceIntoState,
  reconcileVerifiedTask,
  recoverWorktreeState,
} from "./controller-reconcile.ts";
import { enforceClaimEvidence, resolveTaskChecks, writeSetFindings } from "./controller-claims.ts";
import { changedPaths, persistControllerStep } from "./controller-step-persistence.ts";

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

function createPrompt(taskId: string, task: Task, latestTrace: string): string {
  return `Work on one meaningful ${taskId} step in this worktree.
Read AGENTS.md, SPEC.md, ORCHESTRATION.md, and ${task.spec}.
Respect the task write set: ${task.write_set.join(", ")}.
Run applicable checks. Do not start another task, create another worktree, or claim a failing check passed.
The latest durable trace is:
${latestTrace}
Finish with exactly CONTROLLER_RESULT: followed by one JSON object with this shape:
{"status":"continue|review|verified|paused|blocked_external|failed","step":"plan|implementation|verification|review|integration|failure|blocker","summary":"...","changed_paths":["..."],"checks":[{"command":"...","cwd":"...","exit_code":0,"output":"..."}],"decisions":["..."],"findings":[{"severity":"blocker|high|medium|low","summary":"..."}],"blocker":{"authority":"...","error":"...","human_action":"..."},"next_action":"..."}`;
}

async function executeCheck(
  check: OpenCodeStepResult["checks"][number],
  worktree: string,
  timeoutMs: number,
): Promise<OpenCodeStepResult["checks"][number]> {
  if (check.cwd !== worktree && !check.cwd.startsWith(`${worktree}/`)) {
    return {
      ...check,
      exit_code: 1,
      output: `Check cwd is outside the task worktree: ${check.cwd}`,
    };
  }
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  const child = Bun.spawn(["sh", "-lc", check.command], {
    cwd: check.cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal: abort.signal,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).finally(() => clearTimeout(timeout));
  return {
    command: check.command,
    cwd: check.cwd,
    exit_code: exitCode,
    output: `${stdout}${stderr}`.trim().slice(0, 2_000) || "no output",
  };
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

function interruptedResult(request: OpenCodeRequest): OpenCodeStepResult {
  return {
    status: "paused",
    step: "failure",
    session_id: request.session_id ?? "unavailable",
    summary: "Controller interrupted before the next OpenCode step",
    changed_paths: [],
    checks: [],
    decisions: [],
    findings: [],
    next_action: "Resume the recorded task from this trace",
  };
}

function invocationFailure(error: unknown, request: OpenCodeRequest): OpenCodeStepResult {
  const interrupted = error instanceof Error && error.name === "ControllerInterrupted";
  const unavailable = error instanceof Error && error.name === "ModelUnavailable";
  return {
    status: interrupted || unavailable ? "paused" : "failed",
    step: "failure",
    session_id: request.session_id ?? "unavailable",
    summary: `OpenCode invocation failed: ${error instanceof Error ? error.message : String(error)}`,
    changed_paths: [],
    checks: [],
    decisions: [],
    findings: [],
    next_action: unavailable
      ? "Ask the user to select an available capable model, then resume"
      : "Resume the recorded task and retry the interrupted step",
  };
}

async function invokeControllerStep(
  options: ControllerOptions,
  request: OpenCodeRequest,
): Promise<OpenCodeStepResult> {
  if (options.isInterrupted?.()) return interruptedResult(request);
  try {
    return await options.invokeOpenCode(request);
  } catch (error) {
    return invocationFailure(error, request);
  }
}

/** Maps a recorded trace status onto the task state it implies. */
async function nextAttemptNumber(taskId: string, repository: string): Promise<number> {
  const branchPrefix = `agent/${taskId.toLowerCase()}-a`;
  const priorAttempts = (
    await run(
      ["git", "branch", "--format=%(refname:short)", "--list", `${branchPrefix}*`],
      repository,
    )
  )
    .split("\n")
    .filter(Boolean)
    .map((name) => Number(name.slice(branchPrefix.length)))
    .filter(Number.isInteger);
  return Math.max(0, ...priorAttempts) + 1;
}

/** Selects the first dependency-complete task and prepares its isolated worktree. */
async function startNextReadyTask(
  state: OrchestrationState,
  options: ControllerOptions,
  repository: string,
): Promise<{
  taskId: string;
  attempt: number;
  relativeWorktree: string;
  worktree: string;
  branch: string;
  baseSha: string;
  latestTrace: string;
}> {
  const readyTask = Object.entries(state.tasks).find(
    ([, candidate]) =>
      (candidate.state === "ready" || candidate.state === "planned") &&
      candidate.depends_on.every((dependency) => state.tasks[dependency]?.state === "verified"),
  );
  if (!readyTask) throw new Error("No dependency-ready task");
  const [taskId, task] = readyTask;
  const attempt = await nextAttemptNumber(taskId, repository);
  const relativeWorktree = `${state.policy.worktree_root}/${taskId.toLowerCase()}-a${attempt}`;
  const worktree = `${repository}/${relativeWorktree}`;
  const branch = `agent/${taskId.toLowerCase()}-a${attempt}`;
  const baseSha = await run(["git", "rev-parse", "HEAD"], repository);
  await run(["mkdir", "-p", `${repository}/${state.policy.worktree_root}`], repository);
  await run(["git", "worktree", "add", "-b", branch, worktree, baseSha], repository);
  const latestTrace = await persistPrepare({
    repository,
    worktree,
    taskId,
    attempt,
    relativeWorktree,
    branch,
    baseSha,
    model: options.model,
    variant: options.variant,
    timeoutMs: state.policy.agent_timeout_minutes * 60_000,
    markReady: task.state === "planned",
  });
  return { taskId, attempt, relativeWorktree, worktree, branch, baseSha, latestTrace };
}

async function executeAndValidateStep(input: {
  options: ControllerOptions;
  request: OpenCodeRequest;
  task: Task;
  taskId: string;
  worktree: string;
  baseSha: string;
  previousTaskState: TaskState;
  previousSessionId: string | undefined;
}): Promise<OpenCodeStepResult> {
  const { options, request, task, taskId, worktree, baseSha } = input;
  let received = await invokeControllerStep(options, request);
  const { unresolvedGates, checksToRun } = resolveTaskChecks(task, worktree, received);
  const actualChecks =
    received.status === "verified"
      ? await Promise.all(
          checksToRun.map((check) => executeCheck(check, worktree, request.timeout_ms)),
        )
      : checksToRun;
  if (options.isInterrupted?.()) {
    received = {
      ...received,
      status: "paused",
      step: "failure",
      summary: "Controller interrupted after the current operation",
      next_action: "Resume the recorded task from this trace",
    };
  }
  const actualPaths = await changedPaths(worktree, baseSha);
  const writeSetViolations = writeSetFindings(actualPaths, task, taskId);
  received = {
    ...received,
    changed_paths: actualPaths,
    checks: actualChecks,
    findings: [...received.findings, ...writeSetViolations],
  };
  return enforceClaimEvidence(received, {
    writeSetViolations,
    previousTaskState: input.previousTaskState,
    previousSessionId: input.previousSessionId,
    task,
    unresolvedGates,
  });
}

/** Reads the task identity a resumable worktree ledger records. */
function resolveActiveTask(
  state: OrchestrationState,
  rootState: OrchestrationState,
  active: WorktreeRecord,
  repository: string,
): {
  taskId: string;
  task: Task;
  attempt: number;
  relativeWorktree: string;
  worktree: string;
  branch: string;
  baseSha: string;
} {
  if (
    !state.current_task ||
    !state.current_attempt ||
    !state.current_branch ||
    !state.current_base_sha
  ) {
    throw new Error("Active worktree has no resumable task state");
  }
  const taskId = state.current_task;
  const task = state.tasks[taskId];
  if (!task) throw new Error(`Active worktree references unknown task ${taskId}`);
  const attempt = state.current_attempt;
  const relativeWorktree =
    state.current_worktree ??
    `${rootState.policy.worktree_root}/${taskId.toLowerCase()}-a${attempt}`;
  const branch = state.current_branch;
  if (active.branch !== `refs/heads/${branch}`) {
    throw new Error(`Recorded branch ${branch} does not own ${relativeWorktree}`);
  }
  return {
    taskId,
    task,
    attempt,
    relativeWorktree,
    worktree: `${repository}/${relativeWorktree}`,
    branch,
    baseSha: state.current_base_sha,
  };
}

/** The highest-numbered durable trace a task has written. */
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
