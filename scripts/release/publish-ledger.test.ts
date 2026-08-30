import { expect, test } from "bun:test";

import {
  planRelease,
  type Authorization,
  type LedgerEntry,
  type RemoteState,
} from "./publish-ledger.ts";

const authorization: Authorization = {
  commit: "bc2f2eb",
  version: "0.1.1",
  package: "open-websearch-mcp",
  distTag: "latest",
  approvedBy: "atinseau",
  tarballSha256: "a".repeat(64),
};

const absent: RemoteState = { npm: undefined, tag: undefined, githubRelease: undefined };

test("a first run plans every publication step", () => {
  const plan = planRelease({ authorization, ledger: [], remote: absent });

  expect(plan.steps).toEqual(["npm-publish", "git-tag", "github-release"]);
  expect(plan.conflict).toBeUndefined();
});

test("a run resumed after npm succeeded and GitHub failed republishes nothing", () => {
  // The exact RELEASE-006 acceptance criterion: npm success then GitHub
  // failure must resume only the missing steps.
  const ledger: LedgerEntry[] = [
    { step: "npm-publish", state: "succeeded", commit: "bc2f2eb", version: "0.1.1" },
    { step: "git-tag", state: "succeeded", commit: "bc2f2eb", version: "0.1.1" },
    { step: "github-release", state: "failed", commit: "bc2f2eb", version: "0.1.1" },
  ];

  const plan = planRelease({
    authorization,
    ledger,
    remote: {
      npm: { version: "0.1.1", shasum: "a".repeat(64) },
      tag: "v0.1.1",
      githubRelease: undefined,
    },
  });

  expect(plan.steps).toEqual(["github-release"]);
});

test("a step already present remotely is accepted idempotently", () => {
  const plan = planRelease({
    authorization,
    ledger: [],
    remote: {
      npm: { version: "0.1.1", shasum: "a".repeat(64) },
      tag: "v0.1.1",
      githubRelease: "v0.1.1",
    },
  });

  expect(plan.steps).toEqual([]);
  expect(plan.conflict).toBeUndefined();
});

test("a published version with different integrity is a hard conflict, never a republish", () => {
  const plan = planRelease({
    authorization,
    ledger: [],
    remote: {
      npm: { version: "0.1.1", shasum: "b".repeat(64) },
      tag: undefined,
      githubRelease: undefined,
    },
  });

  expect(plan.steps).toEqual([]);
  expect(plan.conflict).toContain("integrity");
});

test("a tag pointing at another commit is a hard conflict", () => {
  const plan = planRelease({
    authorization,
    ledger: [{ step: "git-tag", state: "succeeded", commit: "0000000", version: "0.1.1" }],
    remote: { npm: undefined, tag: "v0.1.1", githubRelease: undefined },
  });

  expect(plan.conflict).toContain("commit");
});

test("publication never proceeds without an authorization naming an approver", () => {
  expect(() =>
    planRelease({
      authorization: { ...authorization, approvedBy: "" },
      ledger: [],
      remote: absent,
    }),
  ).toThrow(/approv/i);
});

test("a version that is not exact SemVer is refused before any remote call", () => {
  expect(() =>
    planRelease({
      authorization: { ...authorization, version: "0.1" },
      ledger: [],
      remote: absent,
    }),
  ).toThrow(/SemVer/i);
});
