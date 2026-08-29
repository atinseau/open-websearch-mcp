# VER-003 — TEST-018 reference sources

- Attempt: `test-018-a1`
- Branch: `agent/test-018-a1`
- Worktree: `.worktree/test-018`
- Base: `1bf4445`

## Goal

Close the TEST-018 evidence gap by declaring and isolating deterministic
fixtures, public ranking qrels, and 30–50 Google canaries without making live
Google outcomes release gates.

## Work completed

- Expanded VER-003’s opt-in Google canary from two to a 32-query public corpus.
  The runner remains serial, waits 1.5 seconds between observations, stops after
  its first block/CAPTCHA, emits an informational report, and cleans up both its
  scheduler and owned Obscura process in `finally`.
- Vendored an exact minimal public BEIR SciFact test subset (12 qrels, 11
  queries, 10 documents) with archive/subset SHA-256s and CC-BY-SA-4.0 provenance.
  Added an offline deterministic lexical-ranker evaluator and repeatability test.
- Declared all three sources and their isolation in
  `docs/verification/TEST-018-sources.md`.

## Decision

BEIR SciFact is viable here: the official archive is only 2.75 MB and the
dataset card declares a licence. The evaluator is intentionally a small,
offline, qrels-backed probe, not a claim that its score is a general relevance
oracle. No ground truth was invented.

## Verification

- `bun run benchmark:rank:scifact` produced
  `benchmarks/reports/TEST-018/beir-scifact.json`: MRR@10 `0.5151515151515151`
  and recall@10 `0.9090909090909091`. The query `1` was not retrieved in the
  constrained corpus. This is a measured result, not a threshold and not a
  release verdict.
- `OPEN_WEBSEARCH_LIVE=1 BENCHMARK_REPORT_DIR=benchmarks/reports/TEST-018 bun
  test --isolate tests/live/google-canaries.test.ts` passed and produced
  `benchmarks/reports/TEST-018/ver-003-live-canaries.json`. Google returned a
  block/CAPTCHA observation on the first query (`Bun WebView documentation`),
  so the bounded runner correctly stopped immediately. It made no retry.
- `bun run format`, `bun run lint`, `bun run lint:limits`, `bun run lint:types`,
  `bun run typecheck`, `bun test --parallel --isolate` (233 passed, 1 live skip,
  0 failed), and `bun run check` all passed. `git diff --check` passed.

## Remaining release context

TEST-018 now has the required declared and isolated sources. This does not
resolve the independent ADR-0010 teacher-corpus blocker or turn external Google
availability into a release gate.
