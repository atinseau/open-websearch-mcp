# VER-003 verification report — 2026-08-29

This artifact records the deterministic verification suite introduced for
`SECURITY-001..011`, `ORCH-002..008`, `PROD-007`, `TEST-004`, `TEST-024`, and
`TEST-025`. It is intentionally separate from a live canary observation.

| Area | Evidence | Result |
| --- | --- | --- |
| SSRF | `tests/security/public-network.test.ts`, `tests/security/ver-003-adversarial.test.ts` | Loopback/private/link-local, mapped IPv6, alternate numeric forms, DNS rebinding, and private redirect pivots are rejected before transport. |
| Bounds | `tests/security/public-network.test.ts`, `tests/rendering/installer.test.ts` | Compressed response expansion, raw response bytes, archive download bytes, traversal, and extraction staging are bounded. |
| Injection/redaction | `tests/security/ver-003-adversarial.test.ts`, `tests/architecture/configuration.test.ts` | Active content is stripped; prompt text remains external evidence only; log allowlisting/redaction excludes runtime-built secrets and bodies. |
| Resilience | `tests/rendering/webview-obscura.test.ts`, `tests/security/ver-003-adversarial.test.ts` | Killing owned Obscura mid-navigation marks it unavailable and leaves no group member; scheduler cancellation, interrupted install/migration, and cancellation after preparation leave no reservation. |
| Load/leaks | `tests/load/ver-003-sustained-scheduler.test.ts`, `tests/rendering/webview-obscura.test.ts` | Sustained 80-operation deterministic run holds 16 global, 2 per host, and 1 Google SERP; owned renderer group closes with no process-group members. |

ADR-0009 remains verified against pinned Obscura 0.2.1 by the renderer private-
network integration test. The production wrapper reports `renderer_unavailable`
when its owned Obscura child has exited; it never falls back to another renderer.

Live canaries are opt-in only: run
`OPEN_WEBSEARCH_LIVE=1 BENCHMARK_REPORT_DIR=benchmarks/reports/VER-003 bun test --isolate tests/live`.
They are serialized (two queries) and write an informational JSON artifact.
`blocked` / CAPTCHA / external errors are observations, never release-gating
failures under TEST-025.
