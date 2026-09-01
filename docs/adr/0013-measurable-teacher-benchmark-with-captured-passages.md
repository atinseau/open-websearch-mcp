# Make the teacher benchmark measurable from captured page passages

Status: accepted

Supersedes [ADR-0010](0010-defer-teacher-benchmark-release-gating.md).
Amends the reasoning of
[ADR-0011](0011-reject-self-referential-passage-derived-teacher-refresh.md).

## Context

ADR-0010 deferred the benchmark gate for a concrete reason: every accepted
claim in the sealed `2026-08-28` corpus had an empty `evidence_passages`
array, so the extraction component had no denominator and no total could be
calculated truthfully. That reason was correct and is now addressed.

## Decision

A claim's expected evidence passage is captured from the page the teacher
cited, by a plain HTTP fetch outside the product, and stored in a new dated
corpus. The benchmark is therefore measurable. It is published and versioned,
and it never gates a release.

## What ADR-0011 got right, and what it did not distinguish

ADR-0011 rejected deriving passages from the product's own `web_open` output,
and it was right about the case it examined. Feeding the extractor its own
previous output back in as ground truth would guarantee a match by
construction: the product would grade itself, and the extraction component
would measure nothing.

The distinction it did not draw is that *observing the product* and *building
an independent ground truth* are different acts. The teacher's contribution is
the choice of sources, which is scored by the source-recall and rank
components. What a cited page actually contains is a fact about the page, not
an opinion of either the teacher or the product. Capturing it over raw HTTP,
with no JavaScript, no Obscura, and no product code, produces evidence that is
independent of the thing being measured. ADR-0011's rejection of the
self-referential path stands unchanged; only its implied conclusion — that no
passage source could be independent — is amended.

## Measured result

The capture reached **8 of 18 accepted claims** across 10 cases
(`benchmarks/teachers/fixtures/2026-08-30/capture-report.json` names every
excluded claim and its reason). Two causes account for the other ten: the
claim's required concepts are identifiers that no page spells out, or the
supporting content is rendered by JavaScript and absent from the raw HTML.

Grading the captured corpus against the product produced **no quality score**,
for a reason unrelated to the corpus: all twenty searches were refused by a
Google captcha. The report records each case as `blocked`/`captcha` and scores
it `unmeasurable` rather than assigning the near-zero total an empty result
would otherwise earn — a discovery outage and a bad answer are different
failures, and conflating them would misreport the product. The same renderer
opens the same pages successfully through `web_open`, so this is a discovery
blockage, not a rendering or extraction defect.

A source-only mechanics probe remains available behind an explicit flag. It
feeds the grader empty text, so it now reports no total at all: with a
populated corpus it could have computed one, and that number would have read
as a quality verdict on a run that never happened.

## Limits

Two limits are recorded plainly, because a score without them invites
overstatement.

1. **The corpus is small.** Eighteen accepted claims across ten cases cannot
   arbitrate a release, whatever the totals say.
2. **The passages were captured after the teacher run, not during it.** A page
   may have changed in between, so a captured passage is evidence about the
   page as it stood on the capture date, not as the teacher read it.

## Consequences

- The sealed `2026-08-27` and `2026-08-28` corpora are untouched, and grading
  them still reports `unmeasurable`, unchanged.
- The score is published and versioned under `benchmarks/reports/teacher/`.
  It does not gate a release, and promotion stays refused regardless of it.
- The release readiness report records the ADR-0010 blocker as superseded, and
  the Google captcha as the live obstacle to a quality measurement.
- Raising the capture rate, or measuring quality through a discovery path that
  is not captcha-blocked, is worthwhile future work. Neither is claimed here.

## The measured score does not depend on a warm cache

A search merges discovered candidates with the workspace's local cache
(`mergedCandidates`), so a workspace used for repeated runs and for direct
page opens accumulates evidence that a fresh install would have to fetch. The
scores in this record were all produced in one such workspace, which had 1,346
cache entries — 524 of them still live, including `url.spec.whatwg.org` and
`jprs.jp/glossary` with no expiry at all — and several were written by probes
rather than by benchmark runs.

The benchmark was therefore re-run against an empty workspace holding only a
copied `config.toml`. It wrote 194 cache entries of its own, confirming it
fetched everything from the network, and scored:

| Case | Warm workspace | Empty workspace |
| --- | --- | --- |
| technical-pdfjs | 90 | 90 |
| technical-bun-webview | 86.25 | 86.25 |
| technical-mcp-stdio | 82.5 | 82.5 |
| technical-sqlite-fts5 | 55 | 55 |
| technical-url-canonicalization | 55 | 55 |
| multilingual-ja-web-standards | 5 | 5 |
| **mean** | **62.29** | **62.29** |

Identical, case by case. The published scores measure discovery, rendering and
selection rather than what a workspace happened to have kept.

## The baseline was re-measured, not quoted

The `34.38` this branch is compared against came from a report committed at
`f7c20bf`, before several of the fixes below and under whatever network
conditions held that day. It was re-measured rather than trusted: `main` at
`8370ec5`, run against its own empty workspace holding only a copied
`config.toml`, on the same day and the same network as the branch run above.

| Case | main | this branch |
| --- | --- | --- |
| technical-pdfjs | **5** | **90** |
| technical-mcp-stdio | **5** | **82.5** |
| technical-bun-webview | 81.25 | 86.25 |
| technical-sqlite-fts5 | 55 | 55 |
| technical-url-canonicalization | 55 | 55 |
| multilingual-ja-web-standards | 5 | 5 |
| **mean** | **34.38** | **62.29** |

`main` reproduces its committed score exactly, so the comparison is controlled
rather than inherited.

Two cases carry the whole difference, and both move from 5 — a score that
means the expected source was not found at all — to a relevant result. Neither
came from tuning: `technical-mcp-stdio` was reached by reading a page for the
question that was asked and by comparing releases across a site, and
`technical-pdfjs` by the scoped `site:` pass. The three cases that do not move
are the three this record and
[ADR-0015](0015-lexical-passage-selection-limit.md) bound.

### The origin restriction was verified not to cost anything

Restricting near-duplicate representation to one origin changes what the cache
stores, so the benchmark was re-run against a fresh empty workspace afterwards.
It scored 62.29 — 90, 86.25, 82.5, 55, 55, 5 — identical case by case to the
run before the change.

That was worth checking rather than assuming: the same mechanism that folded an
ACM paper into a dictionary entry also folds a site's own duplicate pages, and
narrowing it could have cost a case its cached evidence.
