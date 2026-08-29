import type {
  OpenCodeRequest,
  OpenCodeStepResult,
  OrchestrationState,
  TaskState,
} from "./controller-types.ts";
import { run } from "./process-utils.ts";
import {
  removeRootFields,
  setRootFields,
  setTableString,
  setTaskAttempts,
  setTaskEvidence,
  setTaskState,
} from "./state-edits.ts";

export function createTrace(input: {
  taskId: string;
  attempt: number;
  stepNumber: number;
  request: OpenCodeRequest;
  result: OpenCodeStepResult;
  branch: string;
  baseSha: string;
  headSha: string;
}): string {
  const { taskId, attempt, stepNumber, request, result, branch, baseSha, headSha } = input;
  const oneLine = (value: string): string => value.replace(/\s+/gu, " ").trim();
  const checks =
    result.checks.length === 0
      ? "none reported"
      : result.checks
          .map(
            (check) =>
              `${oneLine(check.command)} (${check.cwd}) exited ${check.exit_code}: ${oneLine(check.output ?? "no output")}`,
          )
          .join("; ");
  const blocker = result.blocker
    ? `; authority=${oneLine(result.blocker.authority)}, error=${oneLine(result.blocker.error)}, human action=${oneLine(result.blocker.human_action)}`
    : "";
  return `# Step ${String(stepNumber).padStart(4, "0")} - ${taskId} ${result.step}

- Timestamp: ${new Date().toISOString()}
- Status: ${result.status}
- Attempt: ${attempt}
- Worktree / branch / base SHA / head SHA: ${request.cwd} / ${branch} / ${baseSha} / ${headSha}
- OpenCode model / variant / session: ${request.model} / ${request.variant ?? "default"} / ${result.session_id}
- Goal: advance ${taskId} according to its owned specification
- Completed work: ${oneLine(result.summary)}
- Files changed: ${result.changed_paths.join(", ") || "none reported"}
- Commands and outcomes: ${checks}
- Decisions and reasons: ${result.decisions.map(oneLine).join("; ") || "none reported"}
- Findings or blockers: ${result.findings.map((finding) => `${finding.severity}: ${oneLine(finding.summary)}`).join("; ") || "none"}${blocker}
- Remaining work: ${oneLine(result.next_action)}
- Exact next action: ${oneLine(result.next_action)}
`;
}

function rootFields(input: Parameters<typeof persistStep>[0]): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    current_task: input.taskId,
    current_attempt: input.attempt,
    current_worktree: input.relativeWorktree,
    current_branch: input.branch,
    current_base_sha: input.baseSha,
    current_step: input.stepNumber,
    last_trace: input.traceRelative,
  };
  if (input.sessionId) fields.current_session = input.sessionId;
  if (input.headSha) fields.current_head_sha = input.headSha;
  if (input.reviewedDiff) fields.current_reviewed_diff = input.reviewedDiff;
  return fields;
}

function updateStateText(
  input: Parameters<typeof persistStep>[0],
  parsed: OrchestrationState,
  text: string,
): string {
  const attempts = parsed.tasks[input.taskId]?.attempts ?? [];
  let stateText = input.clearPriorOutcome
    ? removeRootFields(text, ["current_session", "current_head_sha", "current_reviewed_diff"])
    : text;
  stateText = setTaskState(stateText, input.taskId, input.taskState);
  stateText = setTaskEvidence(stateText, input.taskId, [
    ...new Set([...(parsed.tasks[input.taskId]?.evidence ?? []), input.traceRelative]),
  ]);
  stateText = setTaskAttempts(stateText, input.taskId, [
    ...attempts.filter((attempt) => attempt.attempt !== input.attempt),
    {
      attempt: input.attempt,
      branch: input.branch,
      worktree: input.relativeWorktree,
      base_sha: input.baseSha,
    },
  ]);
  stateText = setTableString(stateText, "environment", "controller_model", input.model);
  return setRootFields(
    setTableString(stateText, "environment", "controller_variant", input.variant ?? "default"),
    rootFields(input),
  );
}

export async function atomicWrite(path: string, content: string, cwd: string): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await Bun.write(temporary, content);
  await run(["mv", temporary, path], cwd);
}

export async function persistStep(input: {
  worktree: string;
  taskId: string;
  taskState: TaskState;
  model: string;
  variant?: string;
  relativeWorktree: string;
  branch: string;
  baseSha: string;
  attempt: number;
  stepNumber: number;
  traceRelative: string;
  trace: string;
  sessionId?: string;
  headSha?: string;
  reviewedDiff?: string;
  clearPriorOutcome?: boolean;
}): Promise<void> {
  const tracePath = `${input.worktree}/${input.traceRelative}`;
  await atomicWrite(tracePath, input.trace, input.worktree);

  const statePath = `${input.worktree}/docs/orchestration/state.toml`;
  // Controller-owned state was validated before the step and is validated again after persistence.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsed = Bun.TOML.parse(await Bun.file(statePath).text()) as OrchestrationState;
  await atomicWrite(
    statePath,
    updateStateText(input, parsed, await Bun.file(statePath).text()),
    input.worktree,
  );
}

function prepareRequest(input: Parameters<typeof persistPrepare>[0]): OpenCodeRequest {
  return {
    task: input.taskId,
    cwd: input.worktree,
    model: input.model,
    variant: input.variant,
    prompt: "",
    timeout_ms: input.timeoutMs,
  };
}

function prepareResult(
  input: Parameters<typeof persistPrepare>[0],
  ready: boolean,
): OpenCodeStepResult {
  return ready
    ? {
        status: "ready",
        step: "plan",
        session_id: "not-started",
        summary: "Promoted the first dependency-complete planned task to ready",
        changed_paths: [],
        checks: [],
        decisions: ["All declared task dependencies are factually verified on main"],
        findings: [],
        next_action: "Prepare the ready task worktree",
      }
    : {
        status: "continue",
        step: "plan",
        session_id: "not-started",
        summary: "Created or reconciled the task worktree and persisted resumable controller state",
        changed_paths: [],
        checks: [
          {
            command: `git worktree add -b ${input.branch} ${input.relativeWorktree} ${input.baseSha}`,
            cwd: input.repository,
            exit_code: 0,
          },
        ],
        decisions: ["Use the first dependency-complete task and one repository-local worktree"],
        findings: [],
        next_action: "Invoke OpenCode for the first task step",
      };
}

async function persistPreparedStep(
  input: Parameters<typeof persistPrepare>[0],
  taskState: TaskState,
  suffix: string,
): Promise<string> {
  const stepNumber = await nextStepNumber(input.worktree, input.taskId);
  const request = prepareRequest(input);
  const result = prepareResult(input, taskState === "ready");
  const traceRelative = `docs/orchestration/runs/${input.taskId}/${String(stepNumber).padStart(4, "0")}-${suffix}.md`;
  const trace = createTrace({
    taskId: input.taskId,
    attempt: input.attempt,
    stepNumber,
    request,
    result,
    branch: input.branch,
    baseSha: input.baseSha,
    headSha: input.baseSha,
  });
  await persistStep({
    worktree: input.worktree,
    taskId: input.taskId,
    taskState,
    model: input.model,
    variant: input.variant,
    relativeWorktree: input.relativeWorktree,
    branch: input.branch,
    baseSha: input.baseSha,
    attempt: input.attempt,
    stepNumber,
    traceRelative,
    trace,
    clearPriorOutcome: true,
  });
  return trace;
}

export async function nextStepNumber(worktree: string, taskId: string): Promise<number> {
  const directory = `${worktree}/docs/orchestration/runs/${taskId}`;
  await run(["mkdir", "-p", directory], worktree);
  const steps = [...new Bun.Glob("[0-9][0-9][0-9][0-9]-*.md").scanSync({ cwd: directory })]
    .map((name) => Number(name.slice(0, 4)))
    .filter(Number.isInteger);
  return Math.max(0, ...steps) + 1;
}

export async function persistPrepare(input: {
  repository: string;
  worktree: string;
  taskId: string;
  attempt: number;
  relativeWorktree: string;
  branch: string;
  baseSha: string;
  model: string;
  variant?: string;
  timeoutMs: number;
  markReady?: boolean;
}): Promise<string> {
  if (input.markReady) await persistPreparedStep(input, "ready", "ready");
  return persistPreparedStep(input, "in_progress", "prepare");
}
