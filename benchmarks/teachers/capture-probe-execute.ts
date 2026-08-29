import { sanitizeJsonl } from "./contract.ts";
import { prepareProbeInvocation } from "./capture-probe-invocation.ts";
import { commandOutput, runProcess } from "./process-controls.ts";
import type { ProbeObservation } from "./capture-probe-policy.ts";
import type { ProbePlan } from "./capture-probe-plan.ts";

/** A finished probe process: its raw stdout and everything observed about it. */
export type ProbeExecution = {
  stdout: string;
  prompt: string;
  observation: ProbeObservation;
};

/**
 * Runs the planned probe under its isolated invocation and records what was
 * observed. Nothing here judges the outcome: stdout is returned raw and the
 * observation carries the process evidence that later policy documents cite.
 */
export async function executeProbe(input: {
  plan: ProbePlan;
  provider: "codex";
}): Promise<ProbeExecution> {
  const { plan, provider } = input;
  const { teacherCase, promptTemplate, binary, allowedChildExecutable } = plan;
  const { cliVersion, temporaryRoot } = plan;

  const { cwd, prompt, environment, args } = await prepareProbeInvocation({
    temporaryRoot,
    question: teacherCase?.question,
    promptTemplate,
    isCase: teacherCase !== undefined,
  });

  const startedAt = new Date().toISOString();
  const result = await runProcess([binary, ...args], {
    cwd,
    env: environment,
    timeoutMs: 900_000,
    maxOutputBytes: 67_108_864,
    allowedChildExecutables: [allowedChildExecutable],
  });
  const { stdout, stderr, exit_code: exitCode, duration_ms: durationMs } = result;
  const cwdContents = await commandOutput(["/bin/ls", "-A", cwd]);
  const paths = [temporaryRoot, Bun.env.HOME ?? ""];
  const sanitizedStderr = JSON.parse(sanitizeJsonl(JSON.stringify({ stderr }), paths)).stderr;
  return {
    stdout,
    prompt,
    observation: {
      provider,
      cliVersion,
      startedAt,
      durationMs,
      args,
      cwdContents,
      environment,
      exitCode,
      sanitizedStderr,
      processFailure: result.failure,
      paths,
    },
  };
}
