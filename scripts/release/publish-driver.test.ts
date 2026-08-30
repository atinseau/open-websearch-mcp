import { expect, test } from "bun:test";

import { runRelease, type ReleaseEffects } from "./publish-driver.ts";
import type { Authorization, LedgerEntry, RemoteState } from "./publish-ledger.ts";

const authorization: Authorization = {
  commit: "bc2f2eb",
  version: "0.1.1",
  package: "open-websearch-mcp",
  distTag: "latest",
  approvedBy: "atinseau",
  tarballSha256: "a".repeat(64),
};

function recordingEffects(failing?: string): {
  effects: ReleaseEffects;
  calls: string[];
  remote: { value: RemoteState };
} {
  const calls: string[] = [];
  const remote = {
    value: { npm: undefined, tag: undefined, githubRelease: undefined } as RemoteState,
  };
  const effects: ReleaseEffects = {
    observe: () => Promise.resolve(remote.value),
    publishNpm: () => {
      calls.push("npm-publish");
      if (failing === "npm-publish") throw new Error("npm registry rejected the upload");
      remote.value = { ...remote.value, npm: { version: "0.1.1", shasum: "a".repeat(64) } };
      return Promise.resolve();
    },
    createTag: () => {
      calls.push("git-tag");
      if (failing === "git-tag") throw new Error("tag push rejected");
      remote.value = { ...remote.value, tag: "v0.1.1" };
      return Promise.resolve();
    },
    createGithubRelease: () => {
      calls.push("github-release");
      if (failing === "github-release") throw new Error("GitHub API unavailable");
      remote.value = { ...remote.value, githubRelease: "v0.1.1" };
      return Promise.resolve();
    },
  };
  return { effects, calls, remote };
}

test("RELEASE-006 simulation: npm succeeds, GitHub fails, the retry republishes nothing", async () => {
  const first = recordingEffects("github-release");
  const ledger: LedgerEntry[] = [];

  const failed = await runRelease({ authorization, ledger, effects: first.effects });

  expect(first.calls).toEqual(["npm-publish", "git-tag", "github-release"]);
  expect(failed.completed).toBeFalse();
  expect(failed.ledger.filter((entry) => entry.state === "succeeded").map((e) => e.step)).toEqual([
    "npm-publish",
    "git-tag",
  ]);

  // The retry observes the same remote and resumes only the missing step.
  const retry = recordingEffects();
  retry.remote.value = first.remote.value;
  const resumed = await runRelease({
    authorization,
    ledger: failed.ledger,
    effects: retry.effects,
  });

  expect(retry.calls).toEqual(["github-release"]);
  expect(resumed.completed).toBeTrue();
});

test("the ledger is append-only: a retry never rewrites an earlier entry", async () => {
  const first = recordingEffects("github-release");
  const failed = await runRelease({ authorization, ledger: [], effects: first.effects });
  const retry = recordingEffects();
  retry.remote.value = first.remote.value;

  const resumed = await runRelease({
    authorization,
    ledger: failed.ledger,
    effects: retry.effects,
  });

  expect(resumed.ledger.slice(0, failed.ledger.length)).toEqual([...failed.ledger]);
});

test("a hard conflict stops the run before any effect is attempted", async () => {
  const conflicting = recordingEffects();
  conflicting.remote.value = {
    npm: { version: "0.1.1", shasum: "b".repeat(64) },
    tag: undefined,
    githubRelease: undefined,
  };

  const outcome = await runRelease({ authorization, ledger: [], effects: conflicting.effects });

  expect(conflicting.calls).toEqual([]);
  expect(outcome.completed).toBeFalse();
  expect(outcome.conflict).toContain("integrity");
});

test("a fully published release is a no-op rather than a second publication", async () => {
  const done = recordingEffects();
  done.remote.value = {
    npm: { version: "0.1.1", shasum: "a".repeat(64) },
    tag: "v0.1.1",
    githubRelease: "v0.1.1",
  };

  const outcome = await runRelease({ authorization, ledger: [], effects: done.effects });

  expect(done.calls).toEqual([]);
  expect(outcome.completed).toBeTrue();
});
