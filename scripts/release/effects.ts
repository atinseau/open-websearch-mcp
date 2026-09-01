/**
 * The publication effects the release driver executes against.
 *
 * `publish-driver.ts` owns the decision and this file owns the doing, so the
 * driver stays incapable of publishing by accident and its resume behaviour
 * stays simulable. Commands are injected for the same reason: these functions
 * are testable without a registry, a remote, or a credential.
 *
 * Credentials never appear here. `npm` reads `NODE_AUTH_TOKEN` from the
 * environment and `gh` reads `GH_TOKEN`, both supplied by the workflow's
 * environment, so nothing in this file can leak one into an argument list or a
 * log line.
 */
import type { Authorization, RemoteState } from "./publish-ledger.ts";
import type { ReleaseEffects } from "./publish-driver.ts";

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface EffectCommands {
  run(argv: readonly string[]): Promise<CommandResult>;
}

/** Runs a command without a shell, so no argument can be reinterpreted. */
export const spawnCommands: EffectCommands = {
  async run(argv) {
    const child = Bun.spawn([...argv], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code: await child.exited, stdout, stderr };
  },
};

/** Fails loudly: a non-zero step must never be mistaken for a completed one. */
async function required(
  run: EffectCommands["run"],
  argv: readonly string[],
  what: string,
): Promise<CommandResult> {
  const result = await run(argv);
  if (result.code !== 0)
    throw new Error(`${what} failed with exit ${result.code}: ${result.stderr.trim()}`);
  return result;
}

/**
 * What the remote already holds. Every absence reads as "not published" rather
 * than as an error, because a first release legitimately finds nothing and must
 * not be blocked by that.
 */
async function observeRemote(run: EffectCommands["run"]): Promise<RemoteState> {
  const manifest: { name: string; version: string } = await Bun.file("package.json").json();
  const version = manifest.version;
  const published = await run(["npm", "view", `${manifest.name}@${version}`, "--json"]);
  const tag = await run(["git", "ls-remote", "--tags", "origin", `refs/tags/v${version}`]);
  const release = await run([
    "gh",
    "release",
    "view",
    `v${version}`,
    "--json",
    "tagName",
    "-q",
    ".tagName",
  ]);
  return {
    npm: published.code === 0 ? npmState(published.stdout) : undefined,
    tag: tag.code === 0 && tag.stdout.includes(`refs/tags/v${version}`) ? `v${version}` : undefined,
    githubRelease: release.code === 0 && release.stdout.trim() ? release.stdout.trim() : undefined,
  };
}

function npmState(stdout: string): RemoteState["npm"] {
  const value: unknown = JSON.parse(stdout);
  if (!isRecord(value)) return undefined;
  const dist: unknown = value.dist;
  const version: unknown = value.version;
  const shasum: unknown = isRecord(dist) ? dist.shasum : undefined;
  if (typeof version !== "string" || typeof shasum !== "string") return undefined;
  return { version, shasum };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Publishes the tarball the authorization named, at the dist-tag it named.
 * Publishing the working tree instead would publish something no one approved
 * and whose SHA-256 nobody recorded.
 */
async function publishTarball(
  run: EffectCommands["run"],
  tarballPath: string,
  authorization: Authorization,
): Promise<void> {
  await required(
    run,
    [
      "npm",
      "publish",
      tarballPath,
      "--tag",
      authorization.distTag,
      "--provenance",
      "--access",
      "public",
    ],
    "npm publish",
  );
}

/** Tags the authorized commit, not whatever the checkout is sitting on. */
async function tagCommit(run: EffectCommands["run"], authorization: Authorization): Promise<void> {
  const tag = `v${authorization.version}`;
  const title = `${authorization.package} ${authorization.version}`;
  await required(run, ["git", "tag", "-a", tag, authorization.commit, "-m", title], "git tag");
  await required(run, ["git", "push", "origin", `refs/tags/${tag}`], "git push tag");
}

/** Attaches the same tarball, so the release and the registry agree. */
async function publishRelease(
  run: EffectCommands["run"],
  tarballPath: string,
  authorization: Authorization,
): Promise<void> {
  const tag = `v${authorization.version}`;
  const title = `${authorization.package} ${authorization.version}`;
  await required(
    run,
    [
      "gh",
      "release",
      "create",
      tag,
      tarballPath,
      "--title",
      title,
      "--notes-file",
      "docs/release/CHANGELOG.md",
      "--target",
      authorization.commit,
    ],
    "gh release create",
  );
}

export function createReleaseEffects(options: {
  readonly run: EffectCommands["run"];
  readonly tarballPath: string;
}): ReleaseEffects {
  const { run, tarballPath } = options;
  return {
    observe: () => observeRemote(run),
    publishNpm: (authorization) => publishTarball(run, tarballPath, authorization),
    createTag: (authorization) => tagCommit(run, authorization),
    createGithubRelease: (authorization) => publishRelease(run, tarballPath, authorization),
  };
}
