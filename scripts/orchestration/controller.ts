import type { ControllerOptions, OpenCodeStepResult } from "./controller-types.ts";
import { acquireControllerLock } from "./controller-lock.ts";
import { runControllerStep, validateRepository } from "./controller-phases.ts";

export type {
  ControllerOptions,
  OpenCodeRequest,
  OpenCodeStepResult,
  OrchestrationState,
  StepStatus,
  Task,
  TaskState,
} from "./controller-types.ts";

export { validateRepository } from "./controller-phases.ts";

/** Runs controller steps until the task pauses, blocks, or reaches verification. */
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
