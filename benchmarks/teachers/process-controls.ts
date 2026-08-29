export type ProcessCapture = {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  failure?: string;
};

type ProcessOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  input?: string;
  timeoutMs: number;
  maxOutputBytes: number;
  allowedChildExecutables?: string[];
};

const leafCommands = new Set([
  "/bin/kill",
  "/bin/ln",
  "/bin/ls",
  "/bin/mkdir",
  "/bin/mv",
  "/bin/ps",
  "/bin/rm",
  "/bin/test",
  "/usr/bin/install",
  "/usr/bin/mktemp",
]);

export async function runProcess(
  command: string[],
  options: ProcessOptions,
): Promise<ProcessCapture> {
  const started = performance.now();
  const controlledCommand = controlledProcessCommand(command, options.allowedChildExecutables);
  // Spawning per branch keeps Bun's precise stdio types; a conditional `stdin`
  // widens them to `number | FileSink | undefined` and loses the narrowing.
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env ?? Bun.env,
    stdout: "pipe",
    stderr: "pipe",
  } as const;
  const process =
    options.input === undefined
      ? Bun.spawn(controlledCommand, { ...spawnOptions, stdin: "ignore" })
      : Bun.spawn(controlledCommand, { ...spawnOptions, stdin: "pipe" });
  const terminate = (): void => process.kill(9);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, options.timeoutMs);
  let captured: CapturedIo;
  try {
    captured = await captureProcessIo(process, options, terminate);
  } finally {
    clearTimeout(timeout);
  }
  return processCapture(captured, timedOut, options, started);
}

function controlledProcessCommand(command: string[], allowed: string[] | undefined): string[] {
  if (leafCommands.has(command[0] ?? "")) return command;
  return ["/usr/bin/sandbox-exec", "-p", sandboxProfile(command, allowed), ...command];
}

function sandboxProfile(command: string[], allowed: string[] | undefined): string {
  if (allowed === undefined) return "(version 1) (allow default) (deny process-fork) (deny signal)";
  const executables = [command[0], ...allowed]
    .map((path) => `(literal ${JSON.stringify(path)})`)
    .join(" ");
  return `(version 1) (allow default) (deny signal) (deny process-exec) (allow process-exec ${executables})`;
}

type CapturedIo = {
  stdout: { text: string; exceeded: boolean };
  stderr: { text: string; exceeded: boolean };
  exitCode: number;
  ioFailure?: string;
};

type PipedProcess = {
  readonly stdin: Bun.FileSink | undefined;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
};

/**
 * Accepts the piped shape rather than `ReturnType<typeof Bun.spawn>`, whose
 * union of every stdio mode would erase the narrowing the caller established.
 */
async function captureProcessIo(
  process: PipedProcess,
  options: ProcessOptions,
  terminate: () => void,
): Promise<CapturedIo> {
  let ioFailure: string | undefined;
  const guard = async <T>(label: string, action: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await action;
    } catch (error) {
      ioFailure ??= `${label} failed: ${String(error)}`;
      terminate();
      return fallback;
    }
  };
  const input = guard("stdin", writeInput(process.stdin, options.input), undefined);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      guard("stdout", readBounded(process.stdout, options.maxOutputBytes, terminate), {
        text: "",
        exceeded: false,
      }),
      guard("stderr", readBounded(process.stderr, options.maxOutputBytes, terminate), {
        text: "",
        exceeded: false,
      }),
      process.exited,
      input,
    ]);
    return { stdout, stderr, exitCode, ioFailure };
  } catch (error) {
    terminate();
    throw error;
  }
}

async function writeInput(
  sink: Bun.FileSink | undefined,
  input: string | undefined,
): Promise<void> {
  if (input === undefined) return;
  if (sink === undefined) throw new Error("process stdin pipe is unavailable");
  await sink.write(input);
  await sink.end();
}

function processCapture(
  captured: CapturedIo,
  timedOut: boolean,
  options: ProcessOptions,
  started: number,
): ProcessCapture {
  const { stdout, stderr, exitCode, ioFailure } = captured;
  const exceeded = stdout.exceeded ? "stdout" : stderr.exceeded ? "stderr" : undefined;
  const executionFailure = timedOut
    ? `process exceeded ${options.timeoutMs} ms`
    : exceeded !== undefined
      ? `${exceeded} exceeded ${options.maxOutputBytes} bytes`
      : ioFailure;
  return {
    stdout: stdout.text,
    stderr: stderr.text,
    exit_code: exitCode,
    duration_ms: Math.round(performance.now() - started),
    ...(executionFailure === undefined ? {} : { failure: executionFailure }),
  };
}

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  onExceeded: () => void,
): Promise<{ text: string; exceeded: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let exceeded = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = Math.max(0, maxBytes - bytes);
    if (remaining > 0) text += decoder.decode(value.subarray(0, remaining), { stream: true });
    bytes += value.byteLength;
    if (bytes > maxBytes && !exceeded) {
      exceeded = true;
      onExceeded();
    }
  }
  text += decoder.decode();
  return { text, exceeded };
}

export async function commandOutput(command: string[]): Promise<string> {
  const result = await runProcess(command, {
    timeoutMs: 30_000,
    maxOutputBytes: 1_048_576,
  });
  if (result.exit_code !== 0 || result.failure !== undefined) {
    throw new Error(`${command[0]} failed: ${result.failure ?? result.stderr}`);
  }
  return result.stdout.trim();
}

export async function executable(name: string): Promise<string> {
  for (const entry of (Bun.env.PATH ?? "").split(":")) {
    if (entry.includes("cmux-cli-shims")) continue;
    const candidate = `${entry}/${name}`;
    if (await Bun.file(candidate).exists()) return candidate;
  }
  throw new Error(`${name} executable not found outside wrapper shims`);
}

export async function canonicalExecutable(name: string): Promise<string> {
  return await commandOutput([await executable("realpath"), await executable(name)]);
}
