# VER-001 implementation

- Branch/worktree: `agent/ver-001-a1`, `.worktree/ver-001`; base `33ee087`.
- Requirements: TEST-012, TEST-014 through TEST-019.
- Added `benchmarks/grader/`: offline lexical evaluator, fixed 14/6 split,
  threshold classifier, and champion/challenger promotion guard.
- The evaluator uses Unicode normalization, fixture patterns/concepts, exact
  source/equivalent URLs, supplied result text, fixed token cap, and no network,
  clocks, or LLM. Validation identifiers are rejected by the calibration API.
- `bun run benchmark:grade` executes an intentionally source-only mechanics
  probe on the immutable corpus and writes `benchmarks/grader/report.json`.
  Repeating it produced byte-identical JSON.
- Result: 18 accepted claims in 10/20 cases; 0/18 have URL-located expected
  passages. All 20 totals/classifications are `unmeasurable`; promotion refuses
  them. This is an honest no-gate verdict, recorded in ADR-0010.
- Focused commands passed: format, lint, lint:types, typecheck, grader tests,
  and two benchmark runs with `cmp` equality.
- Next: run the full declared project gates and inspect the final diff.
