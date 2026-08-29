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
  const sandboxProfile =
    options.allowedChildExecutables === undefined
      ? "(version 1) (allow default) (deny process-fork) (deny signal)"
      : `(version 1) (allow default) (deny signal) (deny process-exec) (allow process-exec ${[
          command[0],
          ...options.allowedChildExecutables,
        ]
          .map((path) => `(literal ${JSON.stringify(path)})`)
          .join(" ")})`;
  const controlledCommand = leafCommands.has(command[0] ?? "")
    ? command
    : ["/usr/bin/sandbox-exec", "-p", sandboxProfile, ...command];
  const process = Bun.spawn(controlledCommand, {
    cwd: options.cwd,
    env: options.env ?? Bun.env,
    stdin: options.input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const terminate = (): void => {
    process.kill(9);
  };
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, options.timeoutMs);
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
  const input = guard(
    "stdin",
    (async () => {
      if (options.input === undefined) return;
      const sink = process.stdin;
      if (sink === undefined) throw new Error("process stdin pipe is unavailable");
      await sink.write(options.input);
      await sink.end();
    })(),
    undefined,
  );
  let stdout: { text: string; exceeded: boolean };
  let stderr: { text: string; exceeded: boolean };
  let exitCode: number;
  try {
    [stdout, stderr, exitCode] = await Promise.all([
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
  } catch (error) {
    terminate();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
