# Step 0004 - Spike frontier reconciliation

- Timestamp: `2026-08-29`
- Status: verified
- Branch: `agent/spikes-integration`, merging the five completed spike branches.

## Completed work

The feasibility frontier is closed. All five spikes are complete, each with a
report, retained failures, and a challenged decision where one was required.

| Spike | Outcome | Requirements |
| --- | --- | --- |
| SPK-001 | Codex-only teacher corpus, deterministic grounding verifier | TEST-005..011 |
| SPK-002 | Bun.WebView ↔ Obscura adapter, decision not challenged | TEST-020, RENDER-005/006 |
| SPK-003 | Capacity curve; lastSafeCapacity 16 within unchanged 8/40/2/1 bounds | TEST-021 |
| SPK-004 | Obscura native Markdown retained; no extractor adopted | TEST-013, EXTRACT-007 |
| SPK-005 | Alias, lint matrix, FTS5, PDF.js, robots, MCP+Zod, packaging | ARCH-005/006, TEST-022/023 |

## Decisions carried forward

- ADR-0007 defers mechanical feature-boundary enforcement. `ARCH-002` remains
  normative and must be upheld by feature structure and explicit review from
  FND-001 onward, because the only working mechanism requires Oxlint's
  Node-dependent experimental config path that `PROD-005` forbids.
- SPK-003 publishes the controller fixture SPEC-02 consumes. The normative
  capacity bounds are unchanged; only the calibration is new.
- SPK-004 confirms the risk ADR-0006 recorded: the Codex-only corpus exposes no
  URL-located passages, so extractor selection cannot yet be rigorous. No
  extractor is adopted, and the deficit is recorded rather than hidden.

## Open follow-ups

- The GitHub token is invalid, so no pull request was opened. `PROD-009` requires
  every change to reach `main` through a reviewed PR; these branches are
  committed but unmerged, pending user action on authentication.
- SPK-004's calibration deficit should be revisited before VER-001 relies on the
  teacher benchmark for release thresholds.

## Exact next action

Start FND-001 (feature skeleton, public interfaces, architecture gates). Its
dependency SPK-005 is verified. FND-001 must carry the ADR-0007 review
obligation into its acceptance criteria.
