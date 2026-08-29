import { expect, test } from "bun:test";

import { readRefreshMetadata } from "./audit-artifacts.ts";
import { normalizeCapture } from "./normalize-capture.ts";
import { assertRefreshWritable, withRefreshMutation } from "./refresh-lifecycle.ts";
import { ensureRefreshInputs, readRefreshInputs } from "./refresh-inputs.ts";
import { commandOutput as command } from "./process-controls.ts";

async function expectRejection(action: Promise<unknown>, message: string): Promise<void> {
  try {
    await action;
    throw new Error("expected action to reject");
  } catch (error) {
    expect(String(error)).toContain(message);
  }
}
test("serializes refresh writers and rejects post-seal mutation", async () => {
  const root = await command([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/refresh.XXXXXX`,
  ]);
  const date = "2026-08-27";
  try {
    await expectContendedRefreshRejected(root, date);
    await expectStaleLocksRecovered(root, date);
    await expectSealedRefreshRejected(root, date);
  } finally {
    await command(["/bin/rm", "-rf", root]);
  }
});

async function expectContendedRefreshRejected(root: string, date: string): Promise<void> {
  await withRefreshMutation(root, date, async () => {
    await expectRejection(withRefreshMutation(root, date, async () => {}), "refresh is busy");
  });
}

async function expectStaleLocksRecovered(root: string, date: string): Promise<void> {
  const exitedProcess = Bun.spawn(["/usr/bin/true"]); await exitedProcess.exited;
  const staleCandidate = `${root}/.refresh-locks/${date}.lock.${crypto.randomUUID()}.candidate`;
  const malformedCandidate = `${root}/.refresh-locks/${date}.lock.${crypto.randomUUID()}.candidate`;
  const staleOwner = { pid: exitedProcess.pid, token: crypto.randomUUID(), process_start: "stale process", acquired_at: new Date().toISOString() };
  await Bun.write(staleCandidate, `${JSON.stringify(staleOwner)}\n`); await Bun.write(malformedCandidate, "{\n");
  await Bun.write(`${root}/.refresh-locks/${date}.lock`, `${JSON.stringify({ ...staleOwner, token: crypto.randomUUID() })}\n`);
  const results = await competingRefreshMutations(root, date);
  expect(await Bun.file(staleCandidate).exists()).toBe(false); expect(await Bun.file(malformedCandidate).exists()).toBe(false);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
}

async function competingRefreshMutations(root: string, date: string): Promise<PromiseSettledResult<void>[]> {
  let entered = 0; let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const recoveries = Promise.allSettled([withRefreshMutation(root, date, async () => { entered += 1; await held; }), withRefreshMutation(root, date, async () => { entered += 1; await held; })]);
  await waitForRefreshEntry(() => entered);
  expect(entered).toBe(1); release?.(); return recoveries;
}

async function waitForRefreshEntry(entered: () => number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (entered() > 0) return;
    await Bun.sleep(10);
  }
}

async function expectSealedRefreshRejected(root: string, date: string): Promise<void> {
  await Bun.write(`${root}/runs/${date}/manifest.json`, "{}\n");
  await expectRejection(assertRefreshWritable(root, date), "already sealed");
  await expectRejection(withRefreshMutation(root, date, async () => {}), "already sealed");
}

test("snapshots refresh inputs once", async () => {
  const root = await command([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/refresh-inputs.XXXXXX`,
  ]);
  try {
    await Bun.write(`${root}/corpus.json`, '{"cases":["original"]}\n');
    await Bun.write(`${root}/prompt.md`, "Original prompt\n");
    await ensureRefreshInputs(root, "2026-08-27");
    await Bun.write(`${root}/corpus.json`, '{"cases":["changed"]}\n');
    await Bun.write(`${root}/prompt.md`, "Changed prompt\n");
    expect(await readRefreshInputs(root, "2026-08-27")).toEqual({
      corpus: { cases: ["original"] },
      prompt: "Original prompt\n",
    });
    expect(await command(["/bin/ls", "-A", `${root}/runs/2026-08-27`])).toBe("inputs");
  } finally {
    await command(["/bin/rm", "-rf", root]);
  }
});

test("normalizes an interrupted capture without an outer subprocess", async () => {
  const root = await command([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/capture-recovery.XXXXXX`,
  ]);
  const date = "2026-08-28";
  const caseId = "technical-bun-webview";
  try {
    await Bun.write(`${root}/corpus.json`, Bun.file(new URL("corpus.json", import.meta.url)));
    await Bun.write(`${root}/prompt.md`, Bun.file(new URL("prompt.md", import.meta.url)));
    await ensureRefreshInputs(root, date);
    const output = `${root}/runs/${date}/cases/${caseId}/codex`;
    await command(["/bin/mkdir", "-p", output]);
    const events = [
      {
        type: "item.completed",
        item: {
          type: "web_search",
          action: { type: "search" },
          query: "Bun WebView",
        },
      },
      {
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "See https://bun.sh/docs/api/webview.",
        },
      },
      { type: "turn.completed" },
    ];
    await Bun.write(
      `${output}/events.sanitized.jsonl`,
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );
    await Bun.write(
      `${output}/policy.json`,
      `${JSON.stringify({
        cli_version: "test",
        started_at: "2026-08-28T00:00:00Z",
        duration_ms: 1,
        controls: {
          isolated_temporary_cwd: true,
          cwd_unchanged: true,
          wrapper_shim_bypassed: true,
          session_persistence_disabled: true,
        },
        process: { exit_code: 0 },
      })}\n`,
    );

    await normalizeCapture("codex", caseId, date, root);

    expect(await Bun.file(`${output}/run.json`).exists()).toBeTrue();
  } finally {
    await command(["/bin/rm", "-rf", root]);
  }
});

test("allows initial refresh only once and bounds monthly cadence", async () => {
  const root = await command([
    "/usr/bin/mktemp",
    "-d",
    `${Bun.env.TMPDIR ?? "/tmp"}/refresh-cadence.XXXXXX`,
  ]);
  try {
    await command([
      "/bin/mkdir",
      "-p",
      `${root}/runs/2026-07-01`,
      `${root}/runs/2026-08-01`,
      `${root}/runs/2026-08-20`,
    ]);
    await Bun.write(
      `${root}/runs/2026-08-01/manifest.json`,
      `${JSON.stringify({
        schema_version: 1,
        refresh: {
          date: "2026-08-01",
          trigger: "initial",
          immutable: true,
          teachers: [],
        },
        artifacts: [],
      })}\n`,
    );
    await Bun.write(
      `${root}/runs/2026-08-20/refresh.json`,
      `${JSON.stringify({
        schema_version: 1,
        date: "2026-08-20",
        trigger: "initial",
        reason: "Invalid second initial corpus",
        immutable: true,
      })}\n`,
    );
    await Bun.write(
      `${root}/runs/2026-08-01/refresh.json`,
      `${JSON.stringify({
        schema_version: 1,
        date: "2026-08-01",
        trigger: "monthly",
        reason: "Sidecar must not override the sealed manifest",
        immutable: true,
      })}\n`,
    );
    await expectRejection(readRefreshMetadata(root, "2026-08-20"), "initial refresh trigger");
    await Bun.write(
      `${root}/runs/2026-07-01/refresh.json`,
      `${JSON.stringify({
        schema_version: 1,
        date: "2026-07-01",
        trigger: "initial",
        reason: "Invalid backdated initial corpus",
        immutable: true,
      })}\n`,
    );
    await expectRejection(readRefreshMetadata(root, "2026-07-01"), "already used");
    await command(["/bin/rm", "-rf", `${root}/runs/2026-07-01`]);
    await Bun.write(
      `${root}/runs/2026-08-20/refresh.json`,
      `${JSON.stringify({
        schema_version: 1,
        date: "2026-08-20",
        trigger: "monthly",
        reason: "Too soon",
        immutable: true,
      })}\n`,
    );
    await expectRejection(readRefreshMetadata(root, "2026-08-20"), "only 19 days");
  } finally {
    await command(["/bin/rm", "-rf", root]);
  }
});
