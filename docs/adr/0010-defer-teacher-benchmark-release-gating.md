# Defer teacher-benchmark release gating until passage-bearing corpus refresh

Status: challenged

## Decision

Do not use the sealed `2026-08-28` Codex-only teacher corpus as a release gate
for `TEST-015` through `TEST-017`. Keep the deterministic grader and its fixed
14/6 split, but report this corpus as **unmeasurable** rather than treating a
missing extraction denominator as zero, 100, or a reason to retune weights.

## Evidence

`benchmarks/grader/report.json` grades all 20 fixture cases offline. It finds
18 accepted claims in 10 cases; the other 10 cases have no accepted claim.
Every accepted claim has an empty `evidence_passages` array. Consequently the
10-point extraction component has no labelled denominator in every case, and
the weighted total cannot truthfully be calculated. The source-only mechanics
probe reports source/equivalent recall and rank where claims exist, but it is
not a product-relevance evaluation and cannot establish evidence coverage.

This is the corpus limitation predicted by ADR-0006 and confirmed by SPK-004,
not evidence that the product is irrelevant. Assigning a numerical score would
conflate absent teacher labels with poor returned evidence; renormalising the
weights would fit the metric to the deficient corpus.

## Required remedy

Create a new immutable teacher refresh using a passage-exposing capture path.
Each accepted claim must include at least one URL-located expected passage, and
the refresh must retain enough accepted claims across all corpus categories to
make the fixed calibration/validation split meaningful. A new ADR may instead
restore an independently verifiable second teacher, but it must preserve
URL-located passage evidence. Only then may the existing fixed 35/25/15/10/10/5
weights and promotion thresholds gate a release.

## Consequences

- The grader remains a deterministic regression mechanism for result fixtures.
- Promotion rejects an unmeasurable challenger or champion automatically.
- `TEST-019` remains intact: live ranker score/confidence is an internal
  estimate, never an asserted universal relevance oracle.
- Release verification must record this benchmark as deferred, not passed.
