# WEB-004 — streamed bounded fetch and cache

- Branch: `agent/web-004-a1`
- Worktree: `.worktree/web-004`
- Base: `93ca0a2`
- Status: implemented and verified locally

## Design

The public download seam is `@/features/storage`. `downloadDocument` accepts an
injected transport and the public `PublicUrlPolicy` interface from WEB-003, so
it never selects a network adapter or duplicates URL policy. The seam counts a
shared 25 MiB `DownloadBudget`; it rejects oversized declared lengths before
reading and counts every observed decoded stream chunk before writing it.

`BlobStore.putStream` reads Web Stream chunks one at a time, incrementally hashes
them, and writes to a private temporary file. On success it moves the completed
file to its digest name in the blob directory; failures cancel the reader and
remove the temporary file. This keeps direct documents out of full-memory
buffers.

Storage migration 2 records content class, representation kind, byte length,
last access, and pin state. Cache reads return `local_cache`; freshness gives
HTTP `Cache-Control` priority and otherwise consumes FND-002's configurable
news/general/docs/versioned TTLs. Revalidation is explicit. The cache defaults
to 5 GiB and removes unpinned binary, then rendered, then text bodies by LRU.

## Acceptance evidence

- `RENDER-011`: a 24 MiB response streams with `Response.arrayBuffer` replaced
  by a rejecting function; the persisted blob is intact.
- `RENDER-011`: honest oversized headers, lying headers, and a shared aggregate
  budget all fail.
- `SECURITY-004`: decoded bytes from a response marked gzip still abort on the
  decoded-body limit, covering decompression expansion.
- `CACHE-002`: digest-addressed atomic persistence and no retained temporary
  file; existing corruption verification remains covered.
- `CACHE-005`: local-cache provenance, news expiry, docs TTL, forced
  revalidation.
- `CACHE-006`: representation eviction priority, pin preservation, and LRU.
- `CACHE-010`: cached metadata/body survives SQLite restart.

## Gates

All passed: `bun run format`, `bun run lint`, `bun run lint:limits`, `bun run
lint:types`, `bun run typecheck`, `bun test --parallel --isolate`, and `bun run
check` (153 tests). No real network calls are made by tests.

## Blockers

None.
