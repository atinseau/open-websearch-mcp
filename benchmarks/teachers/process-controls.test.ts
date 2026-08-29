import { expect, test } from "bun:test";

import { runProcess } from "./process-controls.ts";

const bun = Bun.which("bun");
if (bun === null) throw new Error("bun executable not found");

test("bounds process output and terminates the producer", async () => {
  const result = await runProcess(
    [bun, "-e", `console.log("x".repeat(4096)); await Bun.sleep(10_000)`],
    {
      timeoutMs: 5_000,
      maxOutputBytes: 64,
    },
  );

  expect(new TextEncoder().encode(result.stdout).byteLength).toBeLessThanOrEqual(64);
  expect(result.failure).toBe("stdout exceeded 64 bytes");
});

test("terminates processes that exceed their deadline", async () => {
  const result = await runProcess([bun, "-e", "await Bun.sleep(10_000)"], {
    timeoutMs: 25,
    maxOutputBytes: 64,
  });

  expect(result.failure).toBe("process exceeded 25 ms");
  expect(result.duration_ms).toBeLessThan(2_000);
});

test("does not expose its process-group control file to the command", async () => {
  const result = await runProcess(
    [bun, "-e", 'console.log(String(Bun.env.PROCESS_GROUP_FILE ?? "absent"))'],
    { timeoutMs: 2_000, maxOutputBytes: 64 },
  );

  expect(result.stdout.trim()).toBe("absent");
});

test("prevents commands from creating detached environment-cleared subprocesses", async () => {
  const script = [
    "try {",
    `  Bun.spawn([${JSON.stringify(bun)}, "-e", "await Bun.sleep(10_000)"], { detached: true, env: {}, stdout: "ignore", stderr: "ignore" });`,
    '} catch (error) { console.log(error && typeof error === "object" && "code" in error ? error.code : "unexpected"); }',
  ].join("\n");
  const result = await runProcess([bun, "-e", script], {
    timeoutMs: 2_000,
    maxOutputBytes: 64,
  });
  expect(result.exit_code).toBe(0);
  expect(result.stdout.trim()).toBe("EPERM");
});

test("prevents commands from signaling their enclosing process", async () => {
  const script = [
    'kill -STOP "$PPID" 2>/dev/null',
    "signal_status=$?",
    'kill -CONT "$PPID" 2>/dev/null',
    'printf "%s\\n" "$signal_status"',
  ].join("; ");
  const result = await runProcess(["/bin/sh", "-c", script], {
    timeoutMs: 2_000,
    maxOutputBytes: 64,
  });

  expect(result.exit_code).toBe(0);
  expect(result.stdout.trim()).not.toBe("0");
});

test("terminates a command that tries to kill its enclosing process", async () => {
  const result = await runProcess(
    ["/bin/sh", "-c", 'kill -KILL "$PPID" 2>/dev/null; exec /bin/sleep 10'],
    { timeoutMs: 25, maxOutputBytes: 64 },
  );

  expect(result.failure).toBe("process exceeded 25 ms");
  expect(result.duration_ms).toBeLessThan(2_000);
});

test("terminates a process when writing to stdin fails", async () => {
  const result = await runProcess(["/bin/sh", "-c", "exec 0<&-; exec /bin/sleep 10"], {
    input: "x".repeat(10_000_000),
    timeoutMs: 2_000,
    maxOutputBytes: 64,
  });
  expect(result.failure).toStartWith("stdin failed:");
  expect(result.duration_ms).toBeLessThan(2_000);
});
