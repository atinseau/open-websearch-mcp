import {
  runController,
  type OpenCodeRequest,
  type OpenCodeStepResult,
  type StepStatus,
} from "./controller";

const statuses = new Set<string>([
  "continue",
  "review",
  "verified",
  "paused",
  "blocked_external",
  "failed",
]);
const steps = new Set<string>([
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBlocker(value: unknown): value is NonNullable<OpenCodeStepResult["blocker"]> {
  return (
    isRecord(value) &&
    typeof value.authority === "string" &&
    typeof value.error === "string" &&
    typeof value.human_action === "string"
  );
}

function isStepStatus(value: unknown): value is StepStatus {
  return typeof value === "string" && statuses.has(value);
}

function isStep(value: unknown): value is OpenCodeStepResult["step"] {
  return typeof value === "string" && steps.has(value);
}

function isSeverity(value: unknown): value is OpenCodeStepResult["findings"][number]["severity"] {
  return typeof value === "string" && ["blocker", "high", "medium", "low"].includes(value);
}

function parseChecks(value: unknown[]): OpenCodeStepResult["checks"] {
  return value.map((check) => {
    if (
      !isRecord(check) ||
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
}

function parseFindings(value: unknown[]): OpenCodeStepResult["findings"] {
  return value.map((finding) => {
    if (
      !isRecord(finding) ||
      !isSeverity(finding.severity) ||
      typeof finding.summary !== "string"
    ) {
      throw new Error("OpenCode returned an invalid review finding");
    }
    return { severity: finding.severity, summary: finding.summary };
  });
}

type ValidatedResultShape = {
  status: StepStatus;
  step: OpenCodeStepResult["step"];
  summary: string;
  next_action: string;
  changed_paths: unknown[];
  checks: unknown[];
  decisions: unknown[];
  findings: unknown[];
  blocker?: unknown;
};

/**
 * Narrows the parsed payload so callers keep TypeScript's guarantees; extracting
 * this check must not cost the narrowing the inline chain used to provide.
 */
function assertResultShape(
  result: Record<string, unknown>,
): asserts result is Record<string, unknown> & ValidatedResultShape {
  if (
    !isStepStatus(result.status) ||
    !isStep(result.step) ||
    typeof result.summary !== "string" ||
    typeof result.next_action !== "string" ||
    !Array.isArray(result.changed_paths) ||
    !Array.isArray(result.checks) ||
    !Array.isArray(result.decisions) ||
    !Array.isArray(result.findings)
  ) {
    throw new Error("OpenCode returned an invalid controller result");
  }
}

function parseResult(value: unknown, sessionId: string): OpenCodeStepResult {
  if (!isRecord(value)) throw new Error("Invalid controller result");
  const result = value;
  assertResultShape(result);
  const checks = parseChecks(result.checks);
  const findings = parseFindings(result.findings);
  const blocker = result.blocker;
  if (blocker !== undefined && !isBlocker(blocker)) {
    throw new Error("OpenCode returned invalid external blocker evidence");
  }

  return {
    status: result.status,
    step: result.step,
    session_id: sessionId,
    summary: result.summary,
    changed_paths: result.changed_paths.map(String),
    checks,
    decisions: result.decisions.map(String),
    findings,
    ...(isBlocker(blocker) ? { blocker } : {}),
    next_action: result.next_action,
  };
}

function buildOpenCodeCommand(request: OpenCodeRequest, auto: boolean): string[] {
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
  return command;
}

function parseOpenCodeEvents(stdout: string): { sessionId: string | undefined; text: string } {
  const events = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value)) return {};
      return {
        ...(typeof value.type === "string" ? { type: value.type } : {}),
        ...(typeof value.sessionID === "string" ? { sessionID: value.sessionID } : {}),
        ...(isRecord(value.part) && typeof value.part.text === "string"
          ? { part: { text: value.part.text } }
          : {}),
      };
    });
  return {
    sessionId: events.find((event) => event.sessionID)?.sessionID,
    text: events
      .flatMap((event) => (event.type === "text" && event.part ? [event.part.text] : []))
      .join("\n"),
  };
}

async function invokeOpenCode(
  request: OpenCodeRequest,
  auto: boolean,
): Promise<OpenCodeStepResult> {
  const command = buildOpenCodeCommand(request, auto);

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
    else if (/model|provider|authentication|unavailable/iu.test(stderr))
      error.name = "ModelUnavailable";
    throw error;
  }

  const { sessionId, text } = parseOpenCodeEvents(stdout);
  const marker = "CONTROLLER_RESULT:";
  const markerIndex = text.lastIndexOf(marker);
  if (!sessionId || markerIndex === -1)
    throw new Error("OpenCode output omitted its session or controller result");
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
