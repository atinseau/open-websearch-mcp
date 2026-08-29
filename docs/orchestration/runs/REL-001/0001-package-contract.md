# REL-001 — package contract

- Task/attempt: `REL-001` / `0001`
- Branch/worktree: `agent/rel-001-a1` / `.worktree/rel-001`
- Base: `33ee087`
- Requirements: `RELEASE-001` through `RELEASE-006` (REL-001 scope)

## Decision

The release candidate is the unscoped public package `open-websearch-mcp` at
version `0.1.1`. The manifest is publishable (`private` removed), Apache-2.0
licensed, and its only executable is `open-websearch-mcp`. The final release
driver must still confirm npm ownership/availability before publication, as
SPEC-10 requires; no package was published in this task.

The bin points to `bin/open-websearch-mcp.ts`, a Bun-shebang wrapper that calls
the CLI explicitly. This matters because Bunx does not make `import.meta.main`
true for the source bin wrapper.

## Artifact boundary

`package.json#files` is an explicit allow-list: executable wrapper, `src`,
`README.md`, `LICENSE`, `NOTICE`, and `tsconfig.json`. The final dry-run lists
69 files and 229.43 KB unpacked. It excludes tests, benchmarks/teacher corpus,
spikes, orchestration records, scripts, development dependencies, Workspace
state, caches, and separately installed Obscura binaries. The small
source-local lint configuration remains because the runtime source directory is
shipped as a whole; it has no runtime effect.

## Documentation

README records `bunx --bun open-websearch-mcp@latest` for trial and
`open-websearch-mcp@0.1.1` for pinned configuration. `docs/integrations/README.md`
has Codex, Claude Code, Gemini CLI, and OpenCode stdio entries using an absolute
`bunx` path and the exact version.

## Verification

The required format, lint, type, full isolated test, check, and dry-run gates
passed. REL-002's packed-artifact SDK smoke test is recorded separately.
