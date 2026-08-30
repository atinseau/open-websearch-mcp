/**
 * Release driver entry point.
 *
 *   bun scripts/release/main.ts <authorization.json> [--dry-run]
 *
 * It plans an authorized release and, in a real run, would execute it through
 * configured publication effects. No credential, registry token, or trusted
 * publishing identity lives here: those are external-authority bootstrap
 * concerns per the packaging spec, so a real run fails loudly until they are
 * supplied rather than appearing to publish.
 */
import { parseAuthorization } from "./authorization.ts";
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
// Without configured effects the remote is unobserved; a dry run reports the
// steps a first authorized run would take.
const plan = planRelease({
  authorization,
  ledger,
  remote: { npm: undefined, tag: undefined, githubRelease: undefined },
});

if (!flags.includes("--dry-run")) {
  console.error(
    "publication effects are not configured: npm credentials, trusted publishing, and GitHub release authority are external bootstrap concerns. Re-run with --dry-run to inspect the plan.",
  );
  process.exit(3);
}

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
