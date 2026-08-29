import { withRefreshMutation } from "./refresh-lifecycle.ts";
import { commandOutput, runProcess } from "./process-controls.ts";

export type CaptureTarget = {
  root: string;
  date: string;
  provider: "codex";
  caseId?: string;
  output: string;
};

export type PublishedCapture = {
  sanitizedEvents: string;
  policy: Record<string, unknown>;
  run: unknown;
  startedAt: string;
  exitCode: number;
  inspection: unknown;
};

export function failureOutput(target: CaptureTarget, startedAt: string): string {
  const timestamp = startedAt.replaceAll(/[-:.]/g, "");
  return `${target.root}/runs/${target.date}/failures/${target.caseId ?? "probe"}/${target.provider}-policy-${timestamp}`;
}

export async function captureOutputExists(target: CaptureTarget): Promise<boolean> {
  return (await Bun.file(`${target.output}/events.sanitized.jsonl`).exists()) || (await Bun.file(`${target.output}/policy.json`).exists()) || (await Bun.file(`${target.output}/run.json`).exists());
}

export async function writeCaptureArtifacts(directory: string, events: string, policy: unknown, run?: unknown): Promise<void> {
  await publishArtifacts(directory, {
    "events.sanitized.jsonl": `${events}\n`,
    "policy.json": `${JSON.stringify(policy, null, 2)}\n`,
    ...(run === undefined ? {} : { "run.json": `${JSON.stringify(run, null, 2)}\n` }),
  });
}

export async function writeMalformedCapture(directory: string, result: unknown): Promise<void> {
  await publishArtifacts(directory, { "result.sanitized.json": `${JSON.stringify(result, null, 2)}\n` });
}

async function publishArtifacts(directory: string, files: Record<string, string>): Promise<void> {
  const temporary = `${directory}.tmp-${crypto.randomUUID()}`;
  try {
    await commandOutput(["/bin/mkdir", "-p", temporary]);
    for (const [name, contents] of Object.entries(files)) await Bun.write(`${temporary}/${name}`, contents);
    const exists = await runProcess(["/bin/test", "-e", directory], { timeoutMs: 30_000, maxOutputBytes: 1_048_576 });
    if (exists.exit_code === 0 && exists.failure === undefined) throw new Error(`immutable probe already exists: ${directory}`);
    await commandOutput(["/bin/mv", temporary, directory]);
  } finally {
    await commandOutput(["/bin/rm", "-rf", temporary]);
  }
}

export async function publishAcceptedCapture(target: CaptureTarget, capture: PublishedCapture): Promise<void> {
  let archivedOutput = target.output;
  let collision = false;
  await withRefreshMutation(target.root, target.date, async () => {
    if (await captureOutputExists(target)) {
      collision = true;
      archivedOutput = failureOutput(target, capture.startedAt);
      await writeCaptureArtifacts(archivedOutput, capture.sanitizedEvents, { ...capture.policy, failure: `immutable probe already exists: ${target.output}` });
      return;
    }
    await writeCaptureArtifacts(target.output, capture.sanitizedEvents, capture.policy, capture.run);
  });
  if (collision) throw new Error(`immutable probe already exists: ${target.output}; attempt archived at ${archivedOutput}`);
  console.log(JSON.stringify({ provider: target.provider, case_id: target.caseId, output: archivedOutput, exit_code: capture.exitCode, inspection: capture.inspection }));
}
