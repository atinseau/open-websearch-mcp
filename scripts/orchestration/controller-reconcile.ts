import type {
  ControllerOptions,
  OpenCodeStepResult,
  OrchestrationState,
  StepStatus,
  Task,
  TaskState,
  WorktreeRecord,
} from "./controller-types.ts";
import { setRootFields, setTaskEvidence, setTaskState } from "./state-edits.ts";
import { atomicWrite, persistPrepare } from "./step-trace.ts";
import { run } from "./process-utils.ts";
import { fullContentDigest, reviewedContentDigest } from "./controller-step-persistence.ts";

function isStepStatus(value: unknown): value is StepStatus {
  return (
    typeof value === "string" &&
    ["ready", "continue", "review", "verified", "paused", "blocked_external", "failed"].includes(
      value,
    )
  );
}

function reconciledTaskState(status: StepStatus): TaskState {
  if (status === "ready") return "ready";
  if (status === "review") return "review";
  if (status === "verified") return "verified";
  if (status === "blocked_external") return "blocked_external";
  return "in_progress";
}

/**
 * Folds a durable trace the controller has not yet recorded back into the
 * worktree ledger, so an interrupted run resumes from what actually happened.
 */
export async function reconcileTraceIntoState(input: {
  activePath: string;
  taskId: string;
  task: Task;
  baseSha: string;
  latestName: string;
  latestTrace: string;
  latestStep: number;
}): Promise<void> {
  const { activePath, taskId, task, baseSha, latestName, latestTrace, latestStep } = input;
  const status = latestTrace.match(/^- Status: (\S+)$/mu)?.[1];
  if (!isStepStatus(status)) {
    throw new Error(`Cannot reconcile ${latestName} without a recorded status`);
  }
  const traceRelative = `docs/orchestration/runs/${taskId}/${latestName}`;
  const session = latestTrace.match(/^- OpenCode model \/ variant \/ session: .+ \/ (.+)$/mu)?.[1];
  let stateText = await Bun.file(`${activePath}/docs/orchestration/state.toml`).text();
  stateText = setTaskState(stateText, taskId, reconciledTaskState(status));
  stateText = setTaskEvidence(stateText, taskId, [...new Set([...task.evidence, traceRelative])]);
  const fields: Record<string, string | number> = {
    current_step: latestStep,
    last_trace: traceRelative,
  };
  if (session && !/unavailable|not-started|not-recorded/iu.test(session)) {
    fields.current_session = session;
  }
  if (status === "verified") {
    fields.current_head_sha = await run(["git", "rev-parse", "HEAD"], activePath);
    fields.current_reviewed_diff = await reviewedContentDigest(activePath, baseSha, taskId);
  }
  stateText = setRootFields(stateText, fields);
  await atomicWrite(`${activePath}/docs/orchestration/state.toml`, stateText, activePath);
}

/**
 * Resolves the task a recovery branch names, refusing anything that is not a
 * dependency-complete task eligible to start.
 */
function recoverableTask(
  branchTaskSlug: string | undefined,
  rootState: OrchestrationState,
): { taskId: string; task: Task } {
  const taskId = branchTaskSlug
    ? Object.keys(rootState.tasks).find((id) => id.toLowerCase() === branchTaskSlug)
    : undefined;
  const task = taskId ? rootState.tasks[taskId] : undefined;
  const eligible =
    task &&
    (task.state === "ready" || task.state === "planned") &&
    task.depends_on.every((dependency) => rootState.tasks[dependency]?.state === "verified");
  if (!taskId || !task || !eligible) {
    throw new Error("Active worktree has no recoverable task state");
  }
  return { taskId, task };
}

/**
 * Rebuilds the ledger for a worktree whose recorded task identity disagrees with
 * its branch, so an interrupted prepare step can resume. Returns true when it
 * rewrote state and the caller must revalidate.
 */
export async function recoverWorktreeState(input: {
  activePath: string;
  active: WorktreeRecord;
  rootState: OrchestrationState;
  state: OrchestrationState;
  options: ControllerOptions;
  repository: string;
}): Promise<boolean> {
  const { activePath, active, rootState, state, options, repository } = input;
  const branchMatch = active.branch?.match(/^refs\/heads\/agent\/(.+)-a(\d+)$/u);
  const actualBranch = branchMatch ? `agent/${branchMatch[1]}-a${branchMatch[2]}` : undefined;
  const actualRelative = branchMatch
    ? `${rootState.policy.worktree_root}/${branchMatch[1]}-a${branchMatch[2]}`
    : undefined;
  if (
    state.current_task &&
    state.current_branch === actualBranch &&
    state.current_worktree === actualRelative
  ) {
    return false;
  }
  const recovered = recoverableTask(branchMatch?.[1], rootState);
  if (!branchMatch) throw new Error("Active worktree has no recoverable task state");
  const recoveredAttempt = Number(branchMatch[2]);
  await persistPrepare({
    repository,
    worktree: activePath,
    taskId: recovered.taskId,
    attempt: recoveredAttempt,
    relativeWorktree: actualRelative!,
    branch: actualBranch!,
    baseSha: await run(
      ["git", "merge-base", "main", `agent/${branchMatch[1]}-a${recoveredAttempt}`],
      repository,
    ),
    model: options.model,
    variant: options.variant,
    timeoutMs: rootState.policy.agent_timeout_minutes * 60_000,
    markReady: recovered.task.state === "planned",
  });
  return true;
}

/**
 * Confirms main already holds the exact reviewed content, then retires the
 * worktree. Returns "merged" when the task was integrated upstream.
 */
export async function reconcileVerifiedTask(input: {
  activePath: string;
  repository: string;
  taskId: string;
  state: OrchestrationState;
  rootState: OrchestrationState;
}): Promise<"merged" | "awaiting-integration"> {
  const { activePath, repository, taskId, state, rootState } = input;
  if (rootState.tasks[taskId]?.state !== "verified") return "awaiting-integration";
  if (await run(["git", "status", "--porcelain"], activePath)) {
    throw new Error(`Merged task ${taskId} still has uncommitted work`);
  }
  const baseSha = state.current_base_sha!;
  const reviewed = state.current_reviewed_diff;
  const identical =
    reviewed &&
    rootState.current_reviewed_diff === reviewed &&
    (await reviewedContentDigest(activePath, baseSha, taskId)) === reviewed &&
    (await reviewedContentDigest(repository, baseSha, taskId)) === reviewed &&
    (await fullContentDigest(activePath, baseSha)) ===
      (await fullContentDigest(repository, baseSha));
  if (!identical) {
    throw new Error(`Main does not contain the exact reviewed ${taskId} content`);
  }
  await run(["git", "worktree", "remove", activePath], repository);
  return "merged";
}

export function pausedForIntegration(
  taskId: string,
  state: OrchestrationState,
): OpenCodeStepResult {
  return {
    status: "paused",
    step: "integration",
    session_id: state.current_session ?? "not-recorded",
    summary: `${taskId} is locally verified and awaits PR integration`,
    changed_paths: [],
    checks: [],
    decisions: [],
    findings: [],
    next_action: "Integrate the exact reviewed task head through PR/CI, then resume from main",
  };
}

/** The worktree ledger may not silently disagree with the running controller. */
export function assertWorktreeModelMatches(
  state: OrchestrationState,
  options: ControllerOptions,
): void {
  const model = state.environment.controller_model;
  if (model !== "selected-at-runtime" && model !== options.model) {
    throw new Error(`Controller model is fixed to ${String(model)}`);
  }
  const variant = state.environment.controller_variant ?? "default";
  if (typeof variant !== "string") throw new Error("Controller variant must be a string");
  if (variant !== (options.variant ?? "default")) {
    throw new Error(`Controller variant is fixed to ${variant}`);
  }
}

/** The next attempt number for a task, derived from its existing branches. */
