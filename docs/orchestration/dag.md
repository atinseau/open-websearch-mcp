# Implementation DAG

The task IDs below are the only top-level work units. The orchestrator may split
a task into reviewed subtasks, but it may not merge their acceptance separately
or bypass a dependency. The machine state lives in `state.toml`.

## Bootstrap

| Task     | Outcome                                                                                                            | Depends on         |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| BOOT-001 | public GitHub repository, `main`, `origin`, Apache license, initial spec commit, bootstrap validator/PR CI         | —                  |
| BOOT-002 | Minimal Bun/OpenCode control loop, state validation, per-step Markdown traces, resume, and `.worktree/` discipline | BOOT-001           |
| BOOT-003 | Bun manifests, exact pins, Oxfmt/Oxlint/TS7, base architecture fixtures                                            | BOOT-002           |
| BOOT-004 | complete PR CI with frozen install, quality/test/package dry run                                                   | BOOT-001, BOOT-003 |

## Feasibility frontier

The controller takes the next dependency-ready task from this frontier.

| Task    | Outcome                                                       | Depends on       |
| ------- | ------------------------------------------------------------- | ---------------- |
| SPK-001 | 20-case Codex teacher corpus and deterministic fixture schema | BOOT-002         |
| SPK-002 | challenged Bun.WebView ↔ Obscura adapter decision             | BOOT-003         |
| SPK-003 | Obscura concurrency/load calibration                          | SPK-002          |
| SPK-004 | Obscura baseline extraction report against teachers           | SPK-001, SPK-002 |
| SPK-005 | aliases/boundaries/FTS5/PDF/robots/MCP/Zod/package probes     | BOOT-003         |

## Foundations

| Task    | Outcome                                                              | Depends on       |
| ------- | -------------------------------------------------------------------- | ---------------- |
| FND-001 | feature skeleton, public interfaces, architecture gates              | SPK-005          |
| FND-002 | workspace, strict TOML schema/hot reload/migrations, session logging | FND-001          |
| FND-003 | SQLite/WAL/FTS path, blobs, cache schema, migrations                 | FND-001, SPK-005 |
| FND-004 | investigation domain and atomic consumption/reservation              | FND-003          |
| FND-005 | global adaptive fair scheduler and cancellation                      | FND-001, SPK-003 |
| FND-006 | official MCP stdio composition, Zod contracts, portable output       | FND-001, SPK-005 |

## Web capabilities

| Task    | Outcome                                                      | Depends on                |
| ------- | ------------------------------------------------------------ | ------------------------- |
| WEB-001 | safe single-flight Obscura installer/update/rollback         | FND-002                   |
| WEB-002 | supervised Obscura process and selected renderer adapter     | WEB-001, SPK-002, FND-005 |
| WEB-003 | public URL/SSRF/redirect/robots/trust safety                 | FND-001, SPK-005          |
| WEB-004 | streamed bounded fetch and content-addressed storage         | FND-003, WEB-003          |
| WEB-005 | extractor registry, safe content, passages, links            | WEB-002, WEB-004, SPK-004 |
| WEB-006 | Google profile, SERP parsing, modules, suggestions, circuits | WEB-002, WEB-003          |
| WEB-007 | query analysis, two-stage ranking, profiles, diagnostics     | WEB-005, SPK-001          |
| WEB-008 | canonicalization, near-dedup, TTL/revalidation/local FTS     | FND-003, WEB-005, WEB-007 |

## Public tools and verification

| Task     | Outcome                                                                          | Depends on                                           |
| -------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| TOOL-001 | `web_open` end-to-end                                                            | FND-004, FND-005, FND-006, WEB-002, WEB-005, WEB-008 |
| TOOL-002 | `web_search` progressive end-to-end                                              | TOOL-001, WEB-006, WEB-007, WEB-008                  |
| VER-001  | deterministic teacher grader, calibration/validation, extraction/ranking reports | TOOL-002, SPK-001                                    |
| VER-002  | MCP compatibility matrix across four harnesses                                   | TOOL-001, TOOL-002                                   |
| VER-003  | security, resilience, load, restart, leak and live-canary reports                | TOOL-002, VER-001                                    |
| VER-004  | complete traceability and clean-checkout release gate                            | VER-001, VER-002, VER-003, BOOT-004                  |

## Distribution

| Task    | Outcome                                                           | Depends on                 |
| ------- | ----------------------------------------------------------------- | -------------------------- |
| REL-001 | public npm identity and executable package contract               | BOOT-001, FND-006          |
| REL-002 | exact-version `bunx --bun` tarball smoke and harness examples     | REL-001, TOOL-002          |
| REL-003 | challenged release/changelog workflow from `main`                 | BOOT-004, REL-002, VER-004 |
| REL-004 | authorized GitHub Release + npm publication + final release trace | REL-003                    |

## Readiness rule

A task is ready only when all dependencies are `verified`. Contracts/interfaces
are merged before their consumers start, and a task depending on an open PR is
not ready. The controller completes one ready task before selecting another.
