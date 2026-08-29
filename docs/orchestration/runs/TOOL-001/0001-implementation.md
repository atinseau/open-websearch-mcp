# TOOL-001 / TOOL-002 — composed public evidence tools

- Attempt: `a1`
- Branch/worktree: `agent/tool-001-a1` / `.worktree/tool-001`
- Base: `e12feb3`
- Status: implementation and verification complete; no commit created.

## Delivered

- Added the investigation-owned `WebResearchApplication`, composing renderer,
  robots policy, deterministic extraction, ranker, discovery, storage-backed
  investigation identity, MCP tool adapter, and production root.
- `web_open` renders only its input URL, applies explicit-open robots authority,
  extracts and focuses passages, prepares the complete response, then takes the
  atomic consumed-page reservation.
- `web_search` discovers candidates, pre-ranks them, renders/extracts them,
  post-ranks evidence, and reserves only emitted results. It excludes pages
  already reserved in the same investigation.
- Consolidated the domain `EvidencePassage` type under extraction (camelCase).
  The investigation/MCP result uses an anonymous snake_case wire projection.
- Corrected rank scoring so absent optional quality flags contribute zero rather
  than NaN, exposed by the composed search test.
- Search now races candidate preparation and emits completed useful evidence up
  to the requested count; a slow remaining destination cannot delay a fast
  result.
- Cached FTS candidates join discovery, fresh cache bodies bypass rendering and
  emit `local_cache`, while stale entries revalidate through rendering.
- Added storage migration 4 and durable, investigation-attributed
  `robots_overrides` records for explicit robots overrides.

## Verification

- `tests/e2e/web-tools.test.ts` covers implicit investigation IDs, focus order,
  render failure before reservation, retry after failure, fast return despite a
  slow candidate, cache reuse/revalidation/provenance, durable robots override,
  and concurrent progressive at-most-once emission.
- The official MCP SDK stdio test now invokes both `web_search` and `web_open`.
- Passed: `bun run format`, `bun run lint`, `bun run lint:limits`, `bun run
  lint:types`, `bun run typecheck`, `bun test --parallel --isolate`, `bun run
  check`, and `git diff --check` (211 passing tests).
