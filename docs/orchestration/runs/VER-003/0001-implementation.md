# VER-003 — implementation and verification

- Attempt: `a1`
- Branch: `agent/ver-003-a1`
- Worktree: `.worktree/ver-003`
- Base/head before commit: `33ee087`

## Delivered

- Added adversarial deterministic coverage for alternative private-address
  spellings, DNS rebinding, private redirect pivots, prompt-injection content,
  runtime-built secret redaction, and cancellation after preparation but before
  reservation.
- Added a sustained 80-navigation scheduler test against the SPK-003 envelope:
  global 16, per-host 2, Google SERP 1, with an empty scheduler on completion.
- Added a serialized, opt-in two-query Google canary. It is excluded from the
  ordinary test run and writes an informational JSON report only.
- Re-ran ADR-0009's pinned Obscura 0.2.1 private-network integration. Added a
  mid-navigation owned-process hard-kill test and fixed a real gap: supervisor
  exit now invalidates its endpoint; production maps the condition to
  `renderer_unavailable` and has no fallback renderer.
- Published deterministic and live artifacts in `benchmarks/reports/VER-003/`.

## Commands and outcomes

- `OPEN_WEBSEARCH_LIVE=1 BENCHMARK_REPORT_DIR=benchmarks/reports/VER-003 bun test --isolate tests/live` — pass; both Google observations were `blocked`, which is expected and informational under TEST-025.
- `bun run format` — pass.
- `bun run lint`, `bun run lint:limits`, `bun run lint:types`, `bun run typecheck` — pass.
- `bun test --parallel --isolate` — pass: 222 passed, 1 opt-in live test skipped, 0 failed.
- `bun run check` — pass.
- `git diff --check` — pass.

## Finding

Before this task, a killed owned Obscura child could leave a stale endpoint in
the supervisor. The selected renderer was never replaced, but the caller could
receive a generic navigation failure. The supervisor now clears the endpoint on
child exit and the production wrapper reports `renderer_unavailable`.

No remaining blocker. Live results are not a release signal by design.
