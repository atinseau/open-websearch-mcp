/**
 * Release driver entry point.
 *
 *   bun scripts/release/main.ts <authorization.json> [--dry-run]
 *
 * It plans an authorized release and executes it through publication effects.
 * No credential lives here: `npm` reads `NODE_AUTH_TOKEN` and `gh` reads
 * `GH_TOKEN` from the environment the workflow supplies, so this file cannot
 * carry a token into an argument list or a log.
 *
 * A real run requires `--tarball`, because the authorization records the
 * SHA-256 of one exact artifact and publishing anything else would publish
 * something nobody approved.
 */
import { parseAuthorization } from "./authorization.ts";
import { createReleaseEffects, spawnCommands } from "./effects.ts";
import { runRelease } from "./publish-driver.ts";
import { planRelease, type LedgerEntry } from "./publish-ledger.ts";

const [path, ...flags] = Bun.argv.slice(2);
if (path === undefined) {
  console.error(
    "expected a release-authorization artifact: bun scripts/release/main.ts <authorization.json> [--dry-run]",
  );
  process.exit(2);
}
const file = Bun.file(path);
if (!(await file.exists())) {
  console.error(`release-authorization artifact not found: ${path}`);
  process.exit(2);
}

const authorization = parseAuthorization(await file.text());
const ledger: LedgerEntry[] = await readLedger();

if (flags.includes("--dry-run")) {
  // A dry run observes nothing, so it reports the steps a first authorized run
  // would take rather than pretending to know the remote.
  const plan = planRelease({
    authorization,
    ledger,
    remote: { npm: undefined, tag: undefined, githubRelease: undefined },
  });
  console.log(
    JSON.stringify({
      dry_run: true,
      published: false,
      commit: authorization.commit,
      version: authorization.version,
      package: authorization.package,
      dist_tag: authorization.distTag,
      approved_by: authorization.approvedBy,
      steps: plan.steps,
      conflict: plan.conflict ?? null,
    }),
  );
  process.exit(0);
}

const tarball = flagValue(flags, "--tarball");
if (tarball === undefined) {
  console.error(
    "a real run requires --tarball <path>: the authorization records one artifact's SHA-256",
  );
  process.exit(2);
}

const outcome = await runRelease({
  authorization,
  ledger,
  effects: createReleaseEffects({
    run: (argv) => spawnCommands.run(argv),
    tarballPath: tarball,
  }),
});

await Bun.write("docs/release/publish-ledger.json", `${JSON.stringify(outcome.ledger, null, 2)}\n`);
console.log(
  JSON.stringify({
    dry_run: false,
    published: outcome.completed,
    commit: authorization.commit,
    version: authorization.version,
    conflict: outcome.conflict ?? null,
    failure: outcome.failure ?? null,
  }),
);
// A conflict or failure must fail the job: the ledger records where to resume.
if (!outcome.completed) process.exit(1);

function flagValue(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

async function readLedger(): Promise<LedgerEntry[]> {
  const ledgerFile = Bun.file("docs/release/publish-ledger.json");
  if (!(await ledgerFile.exists())) return [];
  const value: unknown = JSON.parse(await ledgerFile.text());
  if (!Array.isArray(value)) throw new Error("publish ledger is not an array");
  return value.map(ledgerEntry);
}

function ledgerEntry(value: unknown): LedgerEntry {
  if (typeof value !== "object" || value === null)
    throw new Error("publish ledger entry is malformed");
  const record: Record<string, unknown> = { ...value };
  return {
    step: stepOf(record.step),
    state: stateOf(record.state),
    commit: stringField(record.commit, "commit"),
    version: stringField(record.version, "version"),
  };
}

function stepOf(value: unknown): LedgerEntry["step"] {
  if (value === "npm-publish" || value === "git-tag" || value === "github-release") return value;
  throw new Error(`publish ledger names an unknown step: ${String(value)}`);
}

function stateOf(value: unknown): LedgerEntry["state"] {
  if (value === "succeeded" || value === "failed" || value === "in-progress") return value;
  throw new Error(`publish ledger names an unknown state: ${String(value)}`);
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`publish ledger entry lacks ${field}`);
  return value;
}
