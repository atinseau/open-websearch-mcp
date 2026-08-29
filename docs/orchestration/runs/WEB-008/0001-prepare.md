# WEB-008 — prepare

- Attempt: 1
- Branch: `agent/web-008-a1`
- Worktree: `.worktree/web-008`
- Base: `5794e7d`

## Goal

Implement deterministic URL canonicalization, lexical near-duplicate detection,
and optional FTS5 local cache search without replacing the WEB-004 cache
freshness, revalidation, persistence, or eviction behavior.

## Reconciled facts

- `SqliteStore` already probes FTS5 by compile option and a temporary table,
  exposes the non-fatal degraded diagnostic, and never installs dependencies.
- `SqliteCache` already provides configurable TTL reads, revalidation markers,
  persisted cache metadata, and LRU eviction with pinning.
- Security owns initial outbound URL sanitization; canonicalization will consume
  that sanitizer before applying cache-key normalization.

## Next action

Add small storage-domain modules and schema migration, then write focused
acceptance tests.
