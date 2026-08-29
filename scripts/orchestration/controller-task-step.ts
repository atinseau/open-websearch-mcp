import type {
  ControllerOptions,
  OpenCodeRequest,
  OpenCodeStepResult,
  OrchestrationState,
  Task,
  TaskState,
  WorktreeRecord,
} from "./controller-types.ts";
import { persistPrepare } from "./step-trace.ts";
import { run } from "./process-utils.ts";
import { changedPaths } from "./controller-step-persistence.ts";
import { enforceClaimEvidence, resolveTaskChecks, writeSetFindings } from "./controller-claims.ts";

export function createPrompt(taskId: string, task: Task, latestTrace: string): string {
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

/** Selects the first dependency-complete task and prepares its isolated worktree. */
export async function startNextReadyTask(
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

export async function executeAndValidateStep(input: {
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
export function resolveActiveTask(
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
