import {
  runController,
  type OpenCodeRequest,
  type OpenCodeStepResult,
  type StepStatus,
} from "./controller";

const statuses = new Set<StepStatus>([
  "continue",
  "review",
  "verified",
  "paused",
  "blocked_external",
  "failed",
]);
const steps = new Set<OpenCodeStepResult["step"]>([
  "plan",
  "implementation",
  "verification",
  "review",
  "integration",
  "failure",
  "blocker",
]);
let activeAbort: AbortController | undefined;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    interrupted = true;
    activeAbort?.abort();
  });
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? undefined : Bun.argv[index + 1];
}

function parseResult(value: unknown, sessionId: string): OpenCodeStepResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid controller result");
  const result = value as Record<string, unknown>;
  if (
    !statuses.has(result.status as StepStatus) ||
    !steps.has(result.step as OpenCodeStepResult["step"]) ||
    typeof result.summary !== "string" ||
    typeof result.next_action !== "string" ||
    !Array.isArray(result.changed_paths) ||
    !Array.isArray(result.checks) ||
    !Array.isArray(result.decisions) ||
    !Array.isArray(result.findings)
  ) {
    throw new Error("OpenCode returned an invalid controller result");
  }

  const checks = result.checks.map((check) => {
    if (
      !check ||
      typeof check !== "object" ||
      typeof check.command !== "string" ||
      typeof check.cwd !== "string" ||
      typeof check.exit_code !== "number"
    ) {
      throw new Error("OpenCode returned an invalid check result");
    }
    return {
      command: check.command,
      cwd: check.cwd,
      exit_code: check.exit_code,
      ...(typeof check.output === "string" ? { output: check.output } : {}),
    };
  });
  const findings = result.findings.map((finding) => {
    if (
      !finding ||
      typeof finding !== "object" ||
      !["blocker", "high", "medium", "low"].includes(String(finding.severity)) ||
      typeof finding.summary !== "string"
    ) {
      throw new Error("OpenCode returned an invalid review finding");
    }
    return {
      severity: finding.severity as "blocker" | "high" | "medium" | "low",
      summary: finding.summary,
    };
  });
  const blocker = result.blocker;
  if (
    blocker !== undefined &&
    (!blocker ||
      typeof blocker !== "object" ||
      typeof blocker.authority !== "string" ||
      typeof blocker.error !== "string" ||
      typeof blocker.human_action !== "string")
  ) {
    throw new Error("OpenCode returned invalid external blocker evidence");
  }

  return {
    status: result.status as StepStatus,
    step: result.step as OpenCodeStepResult["step"],
    session_id: sessionId,
    summary: result.summary,
    changed_paths: result.changed_paths.map(String),
    checks,
    decisions: result.decisions.map(String),
    findings,
    ...(blocker ? { blocker: blocker as OpenCodeStepResult["blocker"] } : {}),
    next_action: result.next_action,
  };
}

async function invokeOpenCode(request: OpenCodeRequest, auto: boolean): Promise<OpenCodeStepResult> {
  const command = [
    "opencode",
    "run",
    "--format",
    "json",
    "--model",
    request.model,
    "--dir",
    request.cwd,
  ];
  if (request.variant) command.push("--variant", request.variant);
  if (request.session_id) command.push("--session", request.session_id);
  else command.push("--title", `${request.task} orchestration`);
  if (auto) command.push("--auto");
  command.push(request.prompt);

  const abort = new AbortController();
  activeAbort = abort;
  const timeout = setTimeout(() => abort.abort(), request.timeout_ms);
  const child = Bun.spawn(command, {
    cwd: request.cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal: abort.signal,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).finally(() => {
    clearTimeout(timeout);
    activeAbort = undefined;
  });
  if (exitCode !== 0) {
    const error = new Error(`OpenCode exited ${exitCode}: ${stderr.trim()}`);
    if (interrupted) error.name = "ControllerInterrupted";
    else if (/model|provider|authentication|unavailable/iu.test(stderr)) error.name = "ModelUnavailable";
    throw error;
  }

  const events = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type?: string; sessionID?: string; part?: { text?: string } });
  const sessionId = events.find((event) => event.sessionID)?.sessionID;
  const text = events
    .filter((event) => event.type === "text" && typeof event.part?.text === "string")
    .map((event) => event.part!.text)
    .join("\n");
  const marker = "CONTROLLER_RESULT:";
  const markerIndex = text.lastIndexOf(marker);
  if (!sessionId || markerIndex === -1) throw new Error("OpenCode output omitted its session or controller result");
  return parseResult(JSON.parse(text.slice(markerIndex + marker.length).trim()), sessionId);
}

const repository = argument("--repo") ?? process.cwd();
const model = argument("--model") ?? Bun.env.OPENCODE_MODEL;
const variant = argument("--variant") ?? Bun.env.OPENCODE_VARIANT;
if (!model) throw new Error("Select one controller model with --model or OPENCODE_MODEL");

const result = await runController({
  repository,
  model,
  variant,
  isInterrupted: () => interrupted,
  invokeOpenCode: (request) => invokeOpenCode(request, Bun.argv.includes("--auto")),
});
console.log(JSON.stringify(result));
if (result.status === "failed") process.exitCode = 1;
