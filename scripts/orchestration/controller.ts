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
import {
  removeRootFields,
  setRootFields,
  setTableString,
  setTaskAttempts,
  setTaskEvidence,
  setTaskState,
} from "./state-edits.ts";
import { acquireControllerLock } from "./controller-lock.ts";
import {
  atomicWrite,
  createTrace,
  nextStepNumber,
  persistPrepare,
  persistStep,
} from "./step-trace.ts";
import { isRecord, run } from "./process-utils.ts";

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

async function runControllerStep(
  options: ControllerOptions,
  forceFreshSession = false,
): Promise<OpenCodeStepResult> {
  const repository = options.repository.replace(/\/$/u, "");
  const rootBranch = await run(["git", "branch", "--show-current"], repository);
  if (rootBranch !== "main")
    throw new Error(`Controller root must be factual main, found ${rootBranch}`);
  const rootDirty = await run(["git", "status", "--porcelain"], repository);
  if (rootDirty) throw new Error("Controller root main must be clean");
  const rootState = await validateRepository(repository);
  const rootModel = rootState.environment.controller_model;
  if (rootModel !== "selected-at-runtime" && rootModel !== options.model) {
    throw new Error(`Controller model is fixed to ${String(rootModel)}`);
  }
  const rootVariant = rootState.environment.controller_variant ?? "default";
  if (typeof rootVariant !== "string") throw new Error("Controller variant must be a string");
  if (rootModel !== "selected-at-runtime" && rootVariant !== (options.variant ?? "default")) {
    throw new Error(`Controller variant is fixed to ${rootVariant}`);
  }
  const records = (await run(["git", "worktree", "list", "--porcelain"], repository))
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
    const branchMatch = active.branch?.match(/^refs\/heads\/agent\/(.+)-a(\d+)$/u);
    const actualBranch = branchMatch ? `agent/${branchMatch[1]}-a${branchMatch[2]}` : undefined;
    const actualRelative = branchMatch
      ? `${rootState.policy.worktree_root}/${branchMatch[1]}-a${branchMatch[2]}`
      : undefined;
    if (
      !state.current_task ||
      state.current_branch !== actualBranch ||
      state.current_worktree !== actualRelative
    ) {
      const recoveredTaskId = branchMatch
        ? Object.keys(rootState.tasks).find((id) => id.toLowerCase() === branchMatch[1])
        : undefined;
      const recoveredTask = recoveredTaskId ? rootState.tasks[recoveredTaskId] : undefined;
      if (
        !branchMatch ||
        !recoveredTaskId ||
        !recoveredTask ||
        (recoveredTask.state !== "ready" && recoveredTask.state !== "planned") ||
        !recoveredTask.depends_on.every(
          (dependency) => rootState.tasks[dependency]?.state === "verified",
        )
      ) {
        throw new Error("Active worktree has no recoverable task state");
      }
      const recoveredAttempt = Number(branchMatch[2]);
      const recoveredRelative = actualRelative!;
      const recoveredBase = await run(
        ["git", "merge-base", "main", `agent/${branchMatch[1]}-a${recoveredAttempt}`],
        repository,
      );
      await persistPrepare({
        repository,
        worktree: activePath,
        taskId: recoveredTaskId,
        attempt: recoveredAttempt,
        relativeWorktree: recoveredRelative,
        branch: actualBranch!,
        baseSha: recoveredBase,
        model: options.model,
        variant: options.variant,
        timeoutMs: rootState.policy.agent_timeout_minutes * 60_000,
        markReady: recoveredTask.state === "planned",
      });
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
      const status = latestTrace.match(/^- Status: (\S+)$/mu)?.[1];
      if (!isStepStatus(status))
        throw new Error(`Cannot reconcile ${latestName} without a recorded status`);
      const reconciledState: TaskState =
        status === "ready"
          ? "ready"
          : status === "review"
            ? "review"
            : status === "verified"
              ? "verified"
              : status === "blocked_external"
                ? "blocked_external"
                : "in_progress";
      const traceRelative = `docs/orchestration/runs/${taskId}/${latestName}`;
      const session = latestTrace.match(
        /^- OpenCode model \/ variant \/ session: .+ \/ (.+)$/mu,
      )?.[1];
      let stateText = await Bun.file(`${activePath}/docs/orchestration/state.toml`).text();
      stateText = setTaskState(stateText, taskId, reconciledState);
      stateText = setTaskEvidence(stateText, taskId, [
        ...new Set([...task.evidence, traceRelative]),
      ]);
      const fields: Record<string, string | number> = {
        current_step: latestStep,
        last_trace: traceRelative,
      };
      if (session && !/unavailable|not-started|not-recorded/iu.test(session))
        fields.current_session = session;
      if (status === "verified") {
        fields.current_head_sha = await run(["git", "rev-parse", "HEAD"], activePath);
        fields.current_reviewed_diff = await reviewedContentDigest(activePath, baseSha, taskId);
      }
      stateText = setRootFields(stateText, fields);
      await atomicWrite(`${activePath}/docs/orchestration/state.toml`, stateText, activePath);
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
      if (rootState.tasks[taskId]?.state === "verified") {
        const dirty = await run(["git", "status", "--porcelain"], activePath);
        if (dirty) throw new Error(`Merged task ${taskId} still has uncommitted work`);
        if (
          !state.current_reviewed_diff ||
          rootState.current_reviewed_diff !== state.current_reviewed_diff ||
          (await reviewedContentDigest(activePath, state.current_base_sha!, taskId)) !==
            state.current_reviewed_diff ||
          (await reviewedContentDigest(repository, state.current_base_sha!, taskId)) !==
            state.current_reviewed_diff ||
          (await fullContentDigest(activePath, state.current_base_sha!)) !==
            (await fullContentDigest(repository, state.current_base_sha!))
        ) {
          throw new Error(`Main does not contain the exact reviewed ${taskId} content`);
        }
        await run(["git", "worktree", "remove", activePath], repository);
        return runControllerStep(options);
      }
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
    const selectedModel = state.environment.controller_model;
    if (selectedModel !== "selected-at-runtime" && selectedModel !== options.model) {
      throw new Error(`Controller model is fixed to ${String(selectedModel)}`);
    }
    const selectedVariant = state.environment.controller_variant ?? "default";
    if (typeof selectedVariant !== "string") throw new Error("Controller variant must be a string");
    if (selectedVariant !== (options.variant ?? "default")) {
      throw new Error(`Controller variant is fixed to ${selectedVariant}`);
    }
    stepNumber = await nextStepNumber(worktree, taskId);
    previousTaskState = task.state;
    previousSessionId = state.current_session;
    sessionId = task.state === "review" || forceFreshSession ? undefined : state.current_session;
  } else {
    const readyTask = Object.entries(state.tasks).find(
      ([, candidate]) =>
        (candidate.state === "ready" || candidate.state === "planned") &&
        candidate.depends_on.every((dependency) => state.tasks[dependency]?.state === "verified"),
    );
    if (!readyTask) throw new Error("No dependency-ready task");
    [taskId, task] = readyTask;
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
    attempt = Math.max(0, ...priorAttempts) + 1;
    relativeWorktree = `${state.policy.worktree_root}/${taskId.toLowerCase()}-a${attempt}`;
    worktree = `${repository}/${relativeWorktree}`;
    branch = `agent/${taskId.toLowerCase()}-a${attempt}`;
    baseSha = await run(["git", "rev-parse", "HEAD"], repository);
    await run(["mkdir", "-p", `${repository}/${state.policy.worktree_root}`], repository);
    await run(["git", "worktree", "add", "-b", branch, worktree, baseSha], repository);

    latestTrace = await persistPrepare({
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
  let received: OpenCodeStepResult;
  if (options.isInterrupted?.()) {
    received = {
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
  } else {
    try {
      received = await options.invokeOpenCode(request);
    } catch (error) {
      const interrupted = error instanceof Error && error.name === "ControllerInterrupted";
      const modelUnavailable = error instanceof Error && error.name === "ModelUnavailable";
      received = {
        status: interrupted || modelUnavailable ? "paused" : "failed",
        step: "failure",
        session_id: request.session_id ?? "unavailable",
        summary: `OpenCode invocation failed: ${error instanceof Error ? error.message : String(error)}`,
        changed_paths: [],
        checks: [],
        decisions: [],
        findings: [],
        next_action: modelUnavailable
          ? "Ask the user to select an available capable model, then resume"
          : "Resume the recorded task and retry the interrupted step",
      };
    }
  }
  const requiredChecks = [
    { command: "bun scripts/orchestration/validate.ts --repo .", cwd: worktree, exit_code: -1 },
    { command: "bun test scripts/orchestration", cwd: worktree, exit_code: -1 },
  ];
  const namedGates: Record<string, string> = {
    "control-loop": "bun test scripts/orchestration/controller.test.ts",
    "state-validation": "bun test scripts/orchestration/state.test.ts",
    "step-traces": "bun test scripts/orchestration/main.test.ts",
    "compaction-resume": "bun test scripts/orchestration/controller.test.ts",
    "worktree-confinement": "bun test scripts/orchestration/controller.test.ts",
  };
  const resolvedGates = (task.acceptance_gates ?? []).map((gate) => ({
    gate,
    command: gate.startsWith("command:") ? gate.slice("command:".length).trim() : namedGates[gate],
  }));
  const unresolvedGates = resolvedGates.filter(({ command }) => !command).map(({ gate }) => gate);
  const gateChecks = resolvedGates
    .filter((gate): gate is { gate: string; command: string } => Boolean(gate.command))
    .map(({ command }) => ({ command, cwd: worktree, exit_code: -1 }));
  const checksToRun =
    received.status === "verified"
      ? [
          ...new Map(
            [...received.checks, ...requiredChecks, ...gateChecks].map((check) => [
              `${check.cwd}\0${check.command}`,
              check,
            ]),
          ).values(),
        ]
      : received.checks;
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
  const controllerPaths = ["docs/orchestration/state.toml", `docs/orchestration/runs/${taskId}/`];
  const outsideWriteSet = actualPaths.filter(
    (path) =>
      ![...task.write_set, ...controllerPaths].some(
        (allowed) => path === allowed || path.startsWith(`${allowed.replace(/\/$/u, "")}/`),
      ),
  );
  received = {
    ...received,
    changed_paths: actualPaths,
    checks: actualChecks,
    findings:
      outsideWriteSet.length === 0
        ? received.findings
        : [
            ...received.findings,
            {
              severity: "high",
              summary: `Changed paths outside the task write set: ${outsideWriteSet.join(", ")}`,
            },
          ],
  };
  const invalidVerification =
    received.status === "verified" &&
    (previousTaskState !== "review" ||
      received.step !== "review" ||
      !received.session_id ||
      received.session_id === previousSessionId ||
      !task.acceptance_gates?.length ||
      unresolvedGates.length > 0 ||
      received.checks.length === 0 ||
      received.checks.some((check) => check.exit_code !== 0) ||
      received.findings.some(
        (finding) => finding.severity === "blocker" || finding.severity === "high",
      ));
  const invalidBlocker =
    received.status === "blocked_external" &&
    (received.step !== "blocker" ||
      !received.findings.some(
        (finding) => finding.severity === "blocker" && finding.summary.trim(),
      ) ||
      !received.blocker?.authority.trim() ||
      !received.blocker.error.trim() ||
      !received.blocker.human_action.trim());
  const result: OpenCodeStepResult =
    outsideWriteSet.length > 0
      ? {
          ...received,
          status: "failed",
          step: "failure",
          summary: `Rejected changes outside the task write set: ${received.summary}`,
          next_action: "Move or remove undeclared changes before continuing",
        }
      : invalidVerification
        ? {
            ...received,
            status: "failed",
            step: "failure",
            summary: `Rejected verification claim: ${received.summary}`,
            next_action: "Repair failed checks or blocker/high review findings, then verify again",
          }
        : invalidBlocker
          ? {
              ...received,
              status: "failed",
              step: "failure",
              summary: `Rejected external block without exact blocker evidence: ${received.summary}`,
              next_action:
                "Continue implementation or record the exact unavailable external authority",
            }
          : received;
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
