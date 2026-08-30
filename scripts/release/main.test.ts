import { expect, test } from "bun:test";

import { parseAuthorization } from "./authorization.ts";

const entrypoint = new URL("./main.ts", import.meta.url).pathname;
const repository = new URL("../../", import.meta.url).pathname;

async function run(args: string[]): Promise<{ exitCode: number; output: string }> {
  const process = Bun.spawn(["bun", entrypoint, ...args], {
    cwd: repository,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, output: `${stdout}${stderr}` };
}

test("the driver refuses to run without an authorization artifact", async () => {
  const outcome = await run([]);

  expect(outcome.exitCode).not.toBe(0);
  expect(outcome.output).toMatch(/authorization/i);
});

test("a missing authorization file is named rather than silently treated as absent consent", async () => {
  const outcome = await run(["/tmp/does-not-exist-release-authorization.json"]);

  expect(outcome.exitCode).not.toBe(0);
  expect(outcome.output).toMatch(/does-not-exist-release-authorization/);
});

test("a dry run plans the steps and performs no publication", async () => {
  const path = `${repository}/docs/release/authorization.example.json`;

  const outcome = await run([path, "--dry-run"]);

  expect(outcome.exitCode, outcome.output).toBe(0);
  const plan: unknown = JSON.parse(outcome.output);
  expect(plan).toMatchObject({ dry_run: true, published: false });
});

test("a real run is refused until publication effects are configured", async () => {
  const path = `${repository}/docs/release/authorization.example.json`;

  const outcome = await run([path]);

  // REL-004 keeps npm credentials and trusted publishing external; the driver
  // must fail loudly rather than pretend to publish.
  expect(outcome.exitCode).not.toBe(0);
  expect(outcome.output).toMatch(/not configured|credential|external/i);
});

test("the example artifact cannot be mistaken for a real authorization", async () => {
  const example = parseAuthorization(
    await Bun.file(`${repository}/docs/release/authorization.example.json`).text(),
  );

  // A template that reads as valid consent is an accident waiting to happen,
  // so the example names itself as one.
  expect(example.approvedBy).toMatch(/example/i);
  expect(example.version).toBe("0.0.0");
});
