# FND-004 — Investigation domain and consumption

- Attempt: `a1`
- Branch: `agent/fnd-004-a1`
- Worktree: `.worktree/fnd-004`
- Base: `91ca2cc`

## Completed work

- Added the public investigation service with persistent implicit creation and
  supplied-ID resume behavior.
- Added explicit exploration, which never calls the consumption repository.
- Added consumption of a fully prepared response: cancellation and preparation
  failure occur before the SQLite-backed atomic consumed-page mark; only the
  successful caller gets the response after that mark.
- Extended the existing storage public repository with explicit investigation
  persistence. The investigation feature imports storage only via
  `@/features/storage`.
- Added temporary-workspace acceptance tests for creation/resume, exploration,
  failed preparation and cancellation retry, synchronized concurrent calls, and
  cross-investigation isolation.

## Verification

- `bun run format`
- `bun run lint`
- `bun run lint:limits`
- `bun run lint:types`
- `bun run typecheck`
- `bun test --parallel --isolate`
- `bun run check`

All passed: 132 tests, zero failures.

## Decision

The existing short SQLite `BEGIN IMMEDIATE` + unique `(investigation_id,
canonical_url)` insertion is the irrevocable commit point immediately before
emission. A preparation failure or pre-commit cancellation has not reserved a
page, so retry stays eligible. Cancellation after that commit deliberately
keeps it consumed, preserving at-most-once emission as required by SPEC-06.

## Next action

Review this worktree diff and integrate through the normal reviewed PR flow.
