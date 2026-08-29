import { expect, test } from "bun:test";

import { cleanupBeforePublication, teacherProcessEnvironment } from "./derive-fixture-support.ts";
import { commandOutput as command } from "./process-controls.ts";

async function expectRejection(action: Promise<unknown>, message: string): Promise<void> {
  try {
    await action;
    throw new Error("expected action to reject");
  } catch (error) {
    expect(String(error)).toContain(message);
  }
}
test("does not publish an accepted capture when temporary cleanup fails", async () => {
  const root = await command([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/capture-cleanup.XXXXXX`,
  ]);
  let published = false;
  try {
    await expectRejection(
      cleanupBeforePublication(
        root,
        async () => {
          published = true;
        },
        async () => {
          throw new Error("injected cleanup failure");
        },
      ),
      "injected cleanup failure",
    );
    expect(published).toBe(false);
  } finally {
    await command(["/bin/rm", "-rf", root]);
  }
});

test("passes only allowlisted environment variables to teacher processes", () => {
  const environment = teacherProcessEnvironment("/isolated/home", {
    CODEX_HOME: "/isolated/codex",
  });
  expect(environment.HOME).toBe("/isolated/home");
  expect(environment.CODEX_HOME).toBe("/isolated/codex");
  expect(environment.ANTHROPIC_API_KEY).toBeUndefined();
  expect(environment.ANTHROPIC_BASE_URL).toBeUndefined();
  expect(environment.HTTPS_PROXY).toBeUndefined();
  expect(environment.CLAUDE_CONFIG_DIR).toBeUndefined();
});
