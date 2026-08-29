import type { OpenCodeStepResult, Task, TaskState } from "./controller-types.ts";

const namedGateCommands: Record<string, string> = {
  "control-loop": "bun test scripts/orchestration/controller-step.test.ts",
  "state-validation": "bun test scripts/orchestration/state-graph.test.ts",
  "step-traces": "bun test scripts/orchestration/main.test.ts",
  "compaction-resume": "bun test scripts/orchestration/controller-verify.test.ts",
  "worktree-confinement": "bun test scripts/orchestration/controller-step.test.ts",
};

/**
 * Resolves a task's declared acceptance gates into runnable checks. A verified
 * claim must additionally rerun the mandatory controller checks, so the union is
 * deduplicated by command and working directory.
 */
export function resolveTaskChecks(
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
export function writeSetFindings(
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
  return !(
    hasFreshReviewSession(received, context) &&
    hasResolvedGates(context) &&
    hasPassingChecks(received) &&
    hasNoSeriousFindings(received)
  );
}

function hasFreshReviewSession(
  received: OpenCodeStepResult,
  context: { previousTaskState: TaskState; previousSessionId: string | undefined },
): boolean {
  return (
    context.previousTaskState === "review" &&
    received.step === "review" &&
    Boolean(received.session_id) &&
    received.session_id !== context.previousSessionId
  );
}

function hasResolvedGates(context: { task: Task; unresolvedGates: string[] }): boolean {
  return Boolean(context.task.acceptance_gates?.length) && context.unresolvedGates.length === 0;
}

function hasPassingChecks(received: OpenCodeStepResult): boolean {
  return received.checks.length > 0 && received.checks.every((check) => check.exit_code === 0);
}

function hasNoSeriousFindings(received: OpenCodeStepResult): boolean {
  return !received.findings.some(
    (finding) => finding.severity === "blocker" || finding.severity === "high",
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
export function enforceClaimEvidence(
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

/**
 * Runs one OpenCode step, reruns the declared checks when it claims
 * verification, records what actually changed, and downgrades any claim the
 * evidence does not support.
 */
