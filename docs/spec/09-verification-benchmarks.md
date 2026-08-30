# SPEC-09 — Verification and benchmarks

## Test topology

```text
src/features/**/*.test.ts      # unit tests colocated with behavior
tests/contracts/               # public interfaces and adapters
tests/integration/             # SQLite, filesystem, Obscura, Google fixtures
tests/e2e/                     # real MCP stdio
tests/live/                    # serialized Google canaries
tests/benchmarks/              # relevance/load/extraction graders
tests/fixtures/                # deterministic pages, SERPs, teachers
```

Unit/contract suites run `bun test --parallel --isolate` over all cores.
Integration starts with four workers and may be calibrated; every test owns a
temporary workspace, SQLite, profile, port, and Obscura process. Live Google is
explicit, serialized, bounded, and outside ordinary PR gates. No test writes to
the production home directory.

PR gates include frozen Bun install, Oxfmt check, strict Oxlint, type-aware
lint/type diagnostics, unit/contract/integration/MCP tests, architecture
fixtures, deterministic benchmarks, package dry-run, and leak checks.

## Teacher corpus

SPEC-01 creates immutable teacher runs. Refresh on a major teacher model/CLI
change, before a major product release, or at most monthly. Never overwrite a
run. Store provider, resolved model, CLI version, prompt, locale, timestamp,
duration, raw sanitized JSONL, final answer, and derived fixture in Git.

The teacher is a high-quality baseline, not closed truth. Fixtures describe
claims, required concepts, acceptable patterns, source/equivalent classes,
short evidence spans, and weights. A valid local result may use a superior
equivalent URL.

After fixture generation, no LLM participates in test, grading, calibration, or
promotion. The grader uses Unicode normalization, lexical/n-gram/pattern match,
source equivalence, and versioned deterministic rules. Initial split is 14
calibration / 6 validation; the 100-case corpus uses 80/20.

## Conformity score

| Dimension | Points |
| --- | ---: |
| evidence coverage | 35 |
| source or equivalent recall | 25 |
| source rank | 15 |
| extraction quality | 10 |
| evidence diversity / duplicate control | 10 |
| context/token efficiency | 5 |

Interpretation: 85–100 excellent, 70–84 pertinent, 50–69 degraded, below 50
non-pertinent.

Promote a ranking/config challenger only when mean is at least 75, at least 80%
of cases score 70+, no critical canary is below 50, total gain is at least 3,
and no category loses more than 5. The same gates apply automatically and
publish component deltas.

Add public BEIR/TREC qrels/BRIGHT-compatible ranking cases and 30–50 live Google
canaries without treating either as an oracle for every arbitrary query.

## Release verification

Release additionally requires:

- WebView/Obscura probe on pinned versions;
- load controller report and limits;
- SSRF/robots/injection/archive/redaction suites;
- no orphan process/target/temp file;
- MCP conformance against the pinned Codex compatibility harness, with the
  official SDK contract tests covering both supported protocol revisions;
- packed npm artifact executed through exact-version `bunx --bun`;
- benchmark thresholds and no category regression over 5 points;
- clean-checkout reproduction and 100% requirement traceability.

Live Google failure is informational when external instability is proven. A
deterministic regression or repeated parser failure blocks release.

## Acceptance

Owned requirements: `TEST-001` through `TEST-025`. Acceptance requires tests of
the grader itself, repeatability across two runs, and a report linking every
score to exact fixture evidence.
