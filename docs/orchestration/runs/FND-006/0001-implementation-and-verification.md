# FND-006 — implementation and verification

- Date: 2026-08-29
- Branch: `agent/fnd-006-a1`
- Worktree: `.worktree/fnd-006`
- Base: `459d2bd`
- Status: complete; uncommitted for controller review/integration

## Delivered

- Added exact `@modelcontextprotocol/server@2.0.0`,
  `@modelcontextprotocol/client@2.0.0`, and `zod@4.5.1` dependencies.
- Added official SDK stdio composition with a 4 MiB inbound buffer and only
  `web_search` / `web_open` registrations.
- Added the SPEC-03 Zod input/result contracts, typed boundary conversion, and
  canonical text rendering. Every emitted code block remains fenced and includes
  trust, invisible-character warning, hash, and locator metadata.
- Extended the investigation seam with the complete portable result vocabulary
  while preserving optional execution knobs at the pre-validation adapter seam.
- Added real-process contract tests: the official SDK client spawns a Bun
  stdio server fixture, completes initialization, lists and calls tools,
  validates SDK rejection of bad arguments, and connects with both required
  legacy protocol revisions.

## Evidence

`bun run format`, `bun run lint`, `bun run lint:limits`, `bun run lint:types`,
`bun run typecheck`, `bun test --parallel --isolate`, and `bun run check` all
passed. The isolated test suite reports 115 passing tests.

The real SDK client's successful parse of `tools/list` and `tools/call` is
stdout-purity evidence: any non-MCP stdout emitted by the child fixture would
corrupt stdio framing and make those exchanges fail.

## Next action

Controller review of this uncommitted FND-006 diff, then integration through
the required reviewed PR flow. No blocker found.
