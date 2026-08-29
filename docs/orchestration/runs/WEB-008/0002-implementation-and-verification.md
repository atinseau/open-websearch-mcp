# WEB-008 — implementation and verification

- Attempt: 1
- Branch: `agent/web-008-a1`
- Worktree: `.worktree/web-008`
- Base: `5794e7d`

## Completed work

- Added a stable cache-key canonicalizer that first uses security's outbound URL
  sanitizer, then normalizes scheme/host case, terminal host dots, default URL
  ports, unreserved percent escapes, and non-root trailing slashes.
- Expanded the security-owned tracker list with established click identifiers.
- Added deterministic 64-component lexical three-word-shingle MinHash and a
  caller-supplied `nearDuplicateThreshold`; `0.90` remains configuration-owned,
  not a storage default. Cache aliases retain the original/canonical mapping.
- Added migration 3 for bounded main content, duplicate signatures, and aliases.
- Indexed cached main content in the already-probed FTS5 table. Local search
  returns an explicit `sqlite_fts5_unavailable` diagnostic if capability is
  degraded; cache reads and writes continue unchanged.
- Revalidation writes through the canonical representative and updates its FTS
  document instead of creating a second entry.

## Tests

`tests/storage/web-008-cache.test.ts` proves canonical equivalence and
non-equivalence, fixed MinHash behavior just above/below 0.90, repeatability,
representative selection, FTS retrieval, degraded FTS/cache continuity, and
canonical revalidation. Existing storage tests were updated for migration 3.

## Verification

All exited zero:

```text
bun run format
bun run lint
bun run lint:limits
bun run lint:types
bun run typecheck
bun test --parallel --isolate
bun run check
git diff --check
```

The full isolated suite reported 180 passing tests. No blocker remains. No
commit was created and `docs/orchestration/state.toml` was not changed.

## Next action

Return the worktree and changed files for parent integration/review.
