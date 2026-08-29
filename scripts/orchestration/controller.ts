import type {
  ControllerOptions,
  OpenCodeRequest,
  OpenCodeStepResult,
  OrchestrationState,
  StepStatus,
  Task,
  TaskState,
} from "./controller-types.ts";
import {
  assertDependencyGraph,
  assertPolicy,
  assertReadiness,
  assertRootShape,
  assertTaskShapes,
} from "./state-schema.ts";
import { assertCurrentTask, assertReferencedFiles } from "./state-current.ts";
import { setRootFields, setTaskEvidence, setTaskState } from "./state-edits.ts";
import { acquireControllerLock } from "./controller-lock.ts";
import {
  atomicWrite,
  createTrace,
  nextStepNumber,
  persistPrepare,
  persistStep,
} from "./step-trace.ts";
import { run } from "./process-utils.ts";

export type {
  ControllerOptions,
  OpenCodeRequest,
  OpenCodeStepResult,
  OrchestrationState,
  StepStatus,
  Task,
  TaskState,
};

function isStepStatus(value: unknown): value is StepStatus {
  return (
    typeof value === "string" &&
    ["ready", "continue", "review", "verified", "paused", "blocked_external", "failed"].includes(
      value,
    )
  );
}

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

async function changedPaths(worktree: string, baseSha: string): Promise<string[]> {
  const committed = await run(["git", "diff", "--name-only", `${baseSha}..HEAD`], worktree);
  const tracked = await run(["git", "diff", "--name-only", "HEAD"], worktree);
  const untracked = await run(["git", "ls-files", "--others", "--exclude-standard"], worktree);
  return [
    ...new Set(
      [...committed.split("\n"), ...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean),
    ),
  ].sort();
}

async function contentDigest(worktree: string, paths: string[]): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  for (const path of paths) {
    hash.update(`${path}\0`);
    const file = Bun.file(`${worktree}/${path}`);
    hash.update((await file.exists()) ? await file.arrayBuffer() : "<deleted>");
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function reviewedContentDigest(
  worktree: string,
  baseSha: string,
  taskId: string,
): Promise<string> {
  const controllerPaths = ["docs/orchestration/state.toml", `docs/orchestration/runs/${taskId}/`];
  const paths = (await changedPaths(worktree, baseSha)).filter(
    (path) =>
      !controllerPaths.some(
        (controllerPath) =>
          path === controllerPath || path.startsWith(`${controllerPath.replace(/\/$/u, "")}/`),
      ),
  );
  return contentDigest(worktree, paths);
}

async function fullContentDigest(worktree: string, baseSha: string): Promise<string> {
  return contentDigest(worktree, await changedPaths(worktree, baseSha));
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

type WorktreeRecord = Record<string, string>;

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
async function reconcileTraceIntoState(input: {
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
async function recoverWorktreeState(input: {
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
async function reconcileVerifiedTask(input: {
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

function pausedForIntegration(taskId: string, state: OrchestrationState): OpenCodeStepResult {
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
function assertWorktreeModelMatches(state: OrchestrationState, options: ControllerOptions): void {
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

const namedGateCommands: Record<string, string> = {
  "control-loop": "bun test scripts/orchestration/controller.test.ts",
  "state-validation": "bun test scripts/orchestration/state.test.ts",
  "step-traces": "bun test scripts/orchestration/main.test.ts",
  "compaction-resume": "bun test scripts/orchestration/controller.test.ts",
  "worktree-confinement": "bun test scripts/orchestration/controller.test.ts",
};

/**
 * Resolves a task's declared acceptance gates into runnable checks. A verified
 * claim must additionally rerun the mandatory controller checks, so the union is
 * deduplicated by command and working directory.
 */
function resolveTaskChecks(
  task: Task,
  worktree: string,
  received: OpenCodeStepResult,
): { unresolvedGates: string[]; checksToRun: OpenCodeStepResult["checks"] } {
  const resolvedGates = (task.acceptance_gates ?? []).map((gate) => ({
    gate,
    command: gate.startsWith("command:")
      ? gate.slice("command:".length).trim()
      : namedGateCommands[gate],
  }));
  const unresolvedGates = resolvedGates.filter(({ command }) => !command).map(({ gate }) => gate);
  if (received.status !== "verified") {
    return { unresolvedGates, checksToRun: received.checks };
  }
  const requiredChecks = [
    { command: "bun scripts/orchestration/validate.ts --repo .", cwd: worktree, exit_code: -1 },
    { command: "bun test scripts/orchestration", cwd: worktree, exit_code: -1 },
  ];
  const gateChecks = resolvedGates
    .filter((gate): gate is { gate: string; command: string } => Boolean(gate.command))
    .map(({ command }) => ({ command, cwd: worktree, exit_code: -1 }));
  const checksToRun = [
    ...new Map(
      [...received.checks, ...requiredChecks, ...gateChecks].map((check) => [
        `${check.cwd}\0${check.command}`,
        check,
      ]),
    ).values(),
  ];
  return { unresolvedGates, checksToRun };
}

/**
 * Reports paths a step touched outside its declared write set. The controller's
 * own ledger and trace directory are always permitted.
 */
function writeSetFindings(
  actualPaths: string[],
  task: Task,
  taskId: string,
): OpenCodeStepResult["findings"] {
  const controllerPaths = ["docs/orchestration/state.toml", `docs/orchestration/runs/${taskId}/`];
  const outside = actualPaths.filter(
    (path) =>
      ![...task.write_set, ...controllerPaths].some(
        (allowed) => path === allowed || path.startsWith(`${allowed.replace(/\/$/u, "")}/`),
      ),
  );
  if (outside.length === 0) return [];
  return [
    {
      severity: "high",
      summary: `Changed paths outside the task write set: ${outside.join(", ")}`,
    },
  ];
}

/** A verified claim requires a fresh review session and passing declared gates. */
function verificationClaimIsInvalid(
  received: OpenCodeStepResult,
  context: {
    previousTaskState: TaskState;
    previousSessionId: string | undefined;
    task: Task;
    unresolvedGates: string[];
  },
): boolean {
  if (received.status !== "verified") return false;
  return (
    context.previousTaskState !== "review" ||
    received.step !== "review" ||
    !received.session_id ||
    received.session_id === context.previousSessionId ||
    !context.task.acceptance_gates?.length ||
    context.unresolvedGates.length > 0 ||
    received.checks.length === 0 ||
    received.checks.some((check) => check.exit_code !== 0) ||
    received.findings.some(
      (finding) => finding.severity === "blocker" || finding.severity === "high",
    )
  );
}

/** An external block requires an exact authority, error, and human action. */
function blockerClaimIsInvalid(received: OpenCodeStepResult): boolean {
  if (received.status !== "blocked_external") return false;
  return (
    received.step !== "blocker" ||
    !received.findings.some(
      (finding) => finding.severity === "blocker" && finding.summary.trim(),
    ) ||
    !received.blocker?.authority.trim() ||
    !received.blocker.error.trim() ||
    !received.blocker.human_action.trim()
  );
}

/**
 * Downgrades a claim the evidence does not support. A step may not declare
 * itself verified or externally blocked without the proof each status requires.
 */
function enforceClaimEvidence(
  received: OpenCodeStepResult,
  context: {
    writeSetViolations: OpenCodeStepResult["findings"];
    previousTaskState: TaskState;
    previousSessionId: string | undefined;
    task: Task;
    unresolvedGates: string[];
  },
): OpenCodeStepResult {
  const failure = (summary: string, nextAction: string): OpenCodeStepResult => ({
    ...received,
    status: "failed",
    step: "failure",
    summary,
    next_action: nextAction,
  });
  if (context.writeSetViolations.length > 0) {
    return failure(
      `Rejected changes outside the task write set: ${received.summary}`,
      "Move or remove undeclared changes before continuing",
    );
  }
  if (verificationClaimIsInvalid(received, context)) {
    return failure(
      `Rejected verification claim: ${received.summary}`,
      "Repair failed checks or blocker/high review findings, then verify again",
    );
  }
  if (blockerClaimIsInvalid(received)) {
    return failure(
      `Rejected external block without exact blocker evidence: ${received.summary}`,
      "Continue implementation or record the exact unavailable external authority",
    );
  }
  return received;
}

async function runControllerStep(
  options: ControllerOptions,
  forceFreshSession = false,
): Promise<OpenCodeStepResult> {
  const { repository, rootState } = await establishRootContext(options);
  const records = await readWorktreeRecords(repository);
  const [rootRecord, ...worktreeRecords] = records;
  if (worktreeRecords.length > 1) throw new Error("Only one implementation worktree may be active");

  let state = rootState;
  let taskId: string;
  let task: Task;
  let attempt: number;
  let relativeWorktree: string;
  let worktree: string;
  let branch: string;
  let baseSha: string;
  let stepNumber: number;
  let sessionId: string | undefined;
  let previousSessionId: string | undefined;
  let previousTaskState: TaskState;
  let latestTrace: string;

  const active = worktreeRecords[0];
  if (active) {
    const activePath = active.worktree;
    if (!activePath) throw new Error("Active worktree record has no path");
    if (
      !rootRecord ||
      !activePath.startsWith(`${rootRecord.worktree}/${rootState.policy.worktree_root}/`)
    ) {
      throw new Error(`Worktree is outside ${rootState.policy.worktree_root}: ${activePath}`);
    }
    state = await validateRepository(activePath);
    if (await recoverWorktreeState({ activePath, active, rootState, state, options, repository })) {
      state = await validateRepository(activePath);
    }
    if (
      !state.current_task ||
      !state.current_attempt ||
      !state.current_branch ||
      !state.current_base_sha
    ) {
      throw new Error("Active worktree has no resumable task state");
    }
    taskId = state.current_task;
    task = state.tasks[taskId]!;
    if (!task) throw new Error(`Active worktree references unknown task ${taskId}`);
    attempt = state.current_attempt;
    relativeWorktree =
      state.current_worktree ??
      `${rootState.policy.worktree_root}/${taskId.toLowerCase()}-a${attempt}`;
    worktree = `${repository}/${relativeWorktree}`;
    branch = state.current_branch;
    if (active.branch !== `refs/heads/${branch}`) {
      throw new Error(`Recorded branch ${branch} does not own ${relativeWorktree}`);
    }
    baseSha = state.current_base_sha;
    const traceNames = [
      ...new Bun.Glob("[0-9][0-9][0-9][0-9]-*.md").scanSync({
        cwd: `${worktree}/docs/orchestration/runs/${taskId}`,
      }),
    ].sort();
    const latestName = traceNames.at(-1);
    if (!latestName) throw new Error(`Active task ${taskId} has no durable trace`);
    latestTrace = await Bun.file(
      `${worktree}/docs/orchestration/runs/${taskId}/${latestName}`,
    ).text();
    const latestStep = Number(latestName.slice(0, 4));
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
    if (task.state === "verified") {
      const reconciled = await reconcileVerifiedTask({
        activePath,
        repository,
        taskId,
        state,
        rootState,
      });
      if (reconciled === "merged") return runControllerStep(options);
      return pausedForIntegration(taskId, state);
    }
    assertWorktreeModelMatches(state, options);
    stepNumber = await nextStepNumber(worktree, taskId);
    previousTaskState = task.state;
    previousSessionId = state.current_session;
    sessionId = task.state === "review" || forceFreshSession ? undefined : state.current_session;
  } else {
    const started = await startNextReadyTask(state, options, repository);
    ({ taskId, attempt, relativeWorktree, worktree, branch, baseSha, latestTrace } = started);
    state = await validateRepository(worktree);
    task = state.tasks[taskId]!;
    previousTaskState = task.state;
    previousSessionId = undefined;
    stepNumber = await nextStepNumber(worktree, taskId);
  }

  const request: OpenCodeRequest = {
    task: taskId,
    cwd: worktree,
    model: options.model,
    variant: options.variant,
    session_id: sessionId,
    prompt: createPrompt(taskId, task, latestTrace),
    timeout_ms: state.policy.agent_timeout_minutes * 60_000,
  };
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
  const result = enforceClaimEvidence(received, {
    writeSetViolations,
    previousTaskState,
    previousSessionId,
    task,
    unresolvedGates,
  });
  const taskState: TaskState =
    result.status === "review"
      ? "review"
      : result.status === "verified"
        ? "verified"
        : result.status === "blocked_external"
          ? "blocked_external"
          : "in_progress";
  const headSha = await run(["git", "rev-parse", "HEAD"], worktree);
  const reviewedDiff =
    result.status === "verified"
      ? await reviewedContentDigest(worktree, baseSha, taskId)
      : undefined;
  const traceRelative = `docs/orchestration/runs/${taskId}/${String(stepNumber).padStart(4, "0")}-${result.step}.md`;
  const trace = createTrace({
    taskId,
    attempt,
    stepNumber,
    request,
    result,
    branch,
    baseSha,
    headSha,
  });
  await persistStep({
    worktree,
    taskId,
    taskState,
    model: options.model,
    variant: options.variant,
    relativeWorktree,
    branch,
    baseSha,
    attempt,
    stepNumber,
    traceRelative,
    trace,
    sessionId: result.session_id === "unavailable" ? undefined : result.session_id,
    headSha: result.status === "verified" ? headSha : undefined,
    reviewedDiff,
  });
  return result;
}

export async function runController(options: ControllerOptions): Promise<OpenCodeStepResult> {
  const repository = options.repository.replace(/\/$/u, "");
  const retryLimit = (await validateRepository(repository)).policy.max_step_retries;
  const releaseLock = await acquireControllerLock(repository);
  try {
    let consecutiveFailures = 0;
    let forceFreshSession = false;
    while (true) {
      const result = await runControllerStep(options, forceFreshSession);
      forceFreshSession = false;
      if (result.status === "failed") {
        consecutiveFailures += 1;
        if (consecutiveFailures >= retryLimit) {
          consecutiveFailures = 0;
          forceFreshSession = true;
        }
        continue;
      }
      consecutiveFailures = 0;
      if (result.status === "continue" || result.status === "review") continue;
      return result;
    }
  } finally {
    await releaseLock();
  }
}
