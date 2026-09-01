import { expect, test } from "bun:test";

import { createReleaseEffects, type EffectCommands } from "./effects.ts";
import type { Authorization } from "./publish-ledger.ts";

const authorization: Authorization = {
  commit: "c894e41aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  version: "0.1.1",
  package: "open-websearch-mcp",
  distTag: "latest",
  approvedBy: "atinseau",
  tarballSha256: "a".repeat(64),
};

function recorder(responses: Record<string, { stdout?: string; code?: number }> = {}) {
  const calls: string[][] = [];
  const run: EffectCommands["run"] = async (argv: readonly string[]) => {
    calls.push([...argv]);
    const key = argv.slice(0, 2).join(" ");
    const reply = responses[key] ?? {};
    return { code: reply.code ?? 0, stdout: reply.stdout ?? "", stderr: "" };
  };
  return { calls, run };
}

/**
 * `RELEASE-006` requires publication to resume idempotently, which the driver
 * decides from an observed remote. Observation must therefore report what is
 * already published rather than assuming a first run.
 */
test("RELEASE-006 observes npm, tag, and release state before deciding", async () => {
  const { calls, run } = recorder({
    "npm view": { stdout: JSON.stringify({ version: "0.1.1", dist: { shasum: "abc" } }) },
    "git ls-remote": { stdout: "deadbeef\trefs/tags/v0.1.1\n" },
    "gh release": { stdout: "v0.1.1" },
  });

  const observed = await createReleaseEffects({ run, tarballPath: "/tmp/pkg.tgz" }).observe();

  expect(observed.npm).toEqual({ version: "0.1.1", shasum: "abc" });
  expect(observed.tag).toBe("v0.1.1");
  expect(observed.githubRelease).toBe("v0.1.1");
  expect(calls.length).toBe(3);
});

/** A registry that has never seen the package reports nothing, not an error. */
test("RELEASE-006 reads an unpublished package as absent rather than failing", async () => {
  const { run } = recorder({
    "npm view": { code: 1, stdout: "" },
    "git ls-remote": { stdout: "" },
    "gh release": { code: 1, stdout: "" },
  });

  const observed = await createReleaseEffects({ run, tarballPath: "/tmp/pkg.tgz" }).observe();

  expect(observed.npm).toBeUndefined();
  expect(observed.tag).toBeUndefined();
  expect(observed.githubRelease).toBeUndefined();
});

/**
 * The authorization names the exact dist-tag and tarball; publication must use
 * those rather than whatever the working tree happens to hold.
 */
test("RELEASE-006 publishes the authorized tarball at the authorized dist-tag", async () => {
  const { calls, run } = recorder();

  await createReleaseEffects({ run, tarballPath: "/tmp/pkg.tgz" }).publishNpm(authorization);

  const argv = calls[0] ?? [];
  expect(argv).toContain("/tmp/pkg.tgz");
  expect(argv).toContain("--tag");
  expect(argv).toContain("latest");
});

/** A failing command must surface, never be mistaken for a completed step. */
test("RELEASE-006 raises when a publication command fails", async () => {
  const { run } = recorder({ "npm publish": { code: 1 } });

  expect(
    createReleaseEffects({ run, tarballPath: "/tmp/pkg.tgz" }).publishNpm(authorization),
  ).rejects.toThrow();
});

/** A tag is created against the authorized commit, not against HEAD. */
test("RELEASE-006 tags the authorized commit", async () => {
  const { calls, run } = recorder();

  await createReleaseEffects({ run, tarballPath: "/tmp/pkg.tgz" }).createTag(authorization);

  // The commit is named when the tag is created; the push only moves the ref.
  const tagged = (calls[0] ?? []).join(" ");
  expect(tagged).toContain(authorization.commit);
  expect(tagged).toContain("v0.1.1");
  expect((calls.at(-1) ?? []).join(" ")).toContain("refs/tags/v0.1.1");
});
