# SPEC-10 — Packaging, GitHub, and releases

## Package UX

Publish a public npm package with an executable `bin`. Bun is the package
manager/runtime; usage never invokes `npx` or Node.

Trial/discovery:

```text
bunx --bun <npm-package>@latest
```

Persistent MCP configuration:

```text
command = <absolute path to bunx>
args = ["--bun", "<npm-package>@<exact-version>"]
```

Running without a subcommand starts stdio immediately. The harness launches it;
the user starts no daemon. Bun's cache may eliminate repeated downloads, while
the exact package version makes behavior reproducible. The first tool call
installs the separately pinned Obscura sidecar.

The package name/owner is resolved at release bootstrap from the user's npm
identity. Prefer unscoped `open-websearch-mcp` if owned/available; otherwise use
the authenticated personal scope. This external identity decision cannot be
invented by an agent.

## Repository workflow

The public GitHub repository is named `open-websearch-mcp`, default branch
`main`. A bootstrap root commit may establish the empty protected branch. After
that exception, every change follows:

```text
fresh main → dedicated worktree/branch → single-purpose PR
           → required CI + risk-appropriate fresh review
           → merge to main → final release trace
```

`main` is the only release source. No feature implementation, spec amendment,
version bump, or release fix is committed directly. A PR reverifies after
updating to current `main`.

## PR CI now

The first repository workflow is PR-only and contains no publication secrets:

- frozen Bun install and exact-version check;
- format, strict lint, type-aware lint;
- isolated test suites and deterministic benchmark;
- architecture/security/package dry-run gates;
- artifact upload for reports needed by review.

Live Google and teacher-provider calls never run on untrusted fork PRs.

## Release workflow later

A release is initiated from a green `main` commit. The release mechanism may be
manual dispatch or a version PR, but it must deterministically:

1. verify SemVer version and exact dependency pins;
2. run the full release gates on that commit;
3. build and inspect the npm tarball;
4. install/run it with exact-version `bunx --bun` in a clean environment;
5. publish the public npm package using the configured npm authority;
6. create the matching Git tag and GitHub Release;
7. attach the generated changelog, exact npm tarball, and verification artifacts;
8. record package integrity/version/commit in the final release trace.

External publication requires a versioned `release-authorization` artifact
naming the exact `main` commit, SemVer, npm package, dist-tag, and approving
identity. The driver acquires a commit/version release lease and writes an
append-only ledger containing tarball integrity plus separate states for npm
publish, Git tag, and GitHub Release. Before every step and retry it queries the
remote state: an already matching operation is accepted idempotently; a
different integrity or commit is a hard external conflict. A partial run resumes
only its missing step and never republishes or silently increments a version.

The exact changelog/version automation is selected during its own challenged
release task; behavior above is normative. npm credentials/trusted publishing,
GitHub protections, and repository creation are external-authority bootstrap
tasks and are not fabricated in source.

Releases pin Obscura but do not commit or bundle its binary. Apache-2.0 license
and required notices ship in the package. No `latest` dependency ranges,
caret/tilde product dependencies, or unpinned GitHub actions are accepted.

## Acceptance

Owned requirements: `RELEASE-001` through `RELEASE-007`. `ARCH-010` remains
owned by SPEC-02 and is a packaging prerequisite. The spec
is accepted after package provenance/dry-run tests, a simulated release with no
secrets, and one authorized end-to-end npm/GitHub release from `main`.
