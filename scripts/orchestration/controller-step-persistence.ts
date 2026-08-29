import type {
  ControllerOptions,
  OpenCodeRequest,
  OpenCodeStepResult,
  StepStatus,
} from "./controller-types.ts";
import { createTrace, persistStep } from "./step-trace.ts";
import { run } from "./process-utils.ts";

export async function changedPaths(worktree: string, baseSha: string): Promise<string[]> {
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

export async function reviewedContentDigest(
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

export async function fullContentDigest(worktree: string, baseSha: string): Promise<string> {
  return contentDigest(worktree, await changedPaths(worktree, baseSha));
}

function taskStateForStatus(
  status: StepStatus,
): "in_progress" | "review" | "verified" | "blocked_external" {
  if (status === "review") return "review";
  if (status === "verified") return "verified";
  if (status === "blocked_external") return "blocked_external";
  return "in_progress";
}

type PersistedStep = {
  taskId: string;
  attempt: number;
  relativeWorktree: string;
  worktree: string;
  branch: string;
  baseSha: string;
  stepNumber: number;
};

export async function persistControllerStep(input: {
  step: PersistedStep;
  options: ControllerOptions;
  request: OpenCodeRequest;
  result: OpenCodeStepResult;
}): Promise<void> {
  const { step, options, request, result } = input;
  const headSha = await run(["git", "rev-parse", "HEAD"], step.worktree);
  const reviewedDiff =
    result.status === "verified"
      ? await reviewedContentDigest(step.worktree, step.baseSha, step.taskId)
      : undefined;
  const traceRelative = `docs/orchestration/runs/${step.taskId}/${String(step.stepNumber).padStart(4, "0")}-${result.step}.md`;
  const trace = createTrace({
    taskId: step.taskId,
    attempt: step.attempt,
    stepNumber: step.stepNumber,
    request,
    result,
    branch: step.branch,
    baseSha: step.baseSha,
    headSha,
  });
  await persistStep({
    worktree: step.worktree,
    taskId: step.taskId,
    taskState: taskStateForStatus(result.status),
    model: options.model,
    variant: options.variant,
    relativeWorktree: step.relativeWorktree,
    branch: step.branch,
    baseSha: step.baseSha,
    attempt: step.attempt,
    stepNumber: step.stepNumber,
    traceRelative,
    trace,
    sessionId: result.session_id === "unavailable" ? undefined : result.session_id,
    headSha: result.status === "verified" ? headSha : undefined,
    reviewedDiff,
  });
}
