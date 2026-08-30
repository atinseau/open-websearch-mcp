# REL-004 authorized publication driver

- Task/attempt: REL-004 / 0001
- Branch/worktree: agent/rel-004 / .worktree/rel-004
- Base: bc2f2eb

## What was built

The decision and execution machinery RELEASE-006 requires, with no credential
and no publication performed:

- `scripts/release/authorization.ts` reads the versioned
  `release-authorization` artifact and refuses one that omits the commit,
  SemVer version, package, dist-tag, approving identity, or tarball SHA-256.
- `scripts/release/publish-ledger.ts` decides which of the three steps
  (npm publish, Git tag, GitHub Release) still need to run, given the
  append-only ledger and the observed remote state. It performs no I/O.
- `scripts/release/publish-driver.ts` executes a plan against injected
  effects, appending one ledger entry per step outcome.
- `scripts/release/main.ts` is the entry point. It fails loudly without an
  authorization artifact, and a real run exits non-zero because publication
  effects are deliberately not configured here.

## Why publication is still not performed

The spec makes external publication conditional on a versioned authorization
naming the exact commit, version, package, dist-tag, and approving identity,
and it keeps npm credentials and trusted publishing as external-authority
bootstrap concerns. No such authorization exists, so this task delivers
everything up to that boundary and stops there. Publishing without it would
be an irreversible action the project has not authorized.

## Verification

RELEASE-006's acceptance criterion is a simulation proving resumption after an
npm success followed by a GitHub failure, without republication. That
simulation is an executable test
(`scripts/release/publish-driver.test.ts`): the first run publishes to npm and
tags, then fails on GitHub; the retry calls `github-release` alone, and the
earlier ledger entries are unchanged. Sibling tests cover idempotent
acceptance of an already-present operation, a hard conflict on differing
tarball integrity, and a hard conflict on a tag recorded against another
commit.

`bun run check`: 302 pass, 1 informational live skip, 0 fail.

## What remains

Actual publication: a human authorization artifact, npm credentials or trusted
publishing, and the effect implementations that call them. Those are external
authority, not code this task may fabricate.
