# Lexical passage selection cannot reach the corpus's expected passages

Status: accepted

Records a measured limit of `EXTRACT-009` passage selection against the
`2026-08-30` teacher corpus. It changes no requirement and no threshold.

## Context

The teacher benchmark's `extraction` component scores 0 on every case, and
`evidenceCoverage` scores 7 of 35. Both depend on which two passages a page
contributes, so passage selection was investigated directly rather than tuned.

Two defects were found and fixed first, because they hid the real limit:

- The grader compared an expected passage to a returned one by exact
  substring. The corpus captured its passages from page HTML, where a line
  break inside a sentence carries the source file's indentation and a capture
  ending on a link keeps the markup's surrounding space. On SQLite's FTS5 page
  the two strings differed only as `extensions .` against `extensions.` —
  one character. With it, the expected passage was in none of the page's 145
  grouped passages; without it, it is found whole in one of them.
- `[output]` was validated in every workspace TOML and never read, so
  `search_passages_per_source` could not change what a search returned
  (`CONFIG-004`).

With both fixed, the expected passage is present and findable, and still not
returned. Measured on SQLite's FTS5 page, question
`technical-sqlite-fts5`:

| Group | Expected phrases carried | Question terms matched |
| --- | --- | --- |
| 9 (holds the expected passage) | 3 of 3 — the most on the page | 7 |
| 35 (returned) | 1 | 9 |
| 138 (returned) | 0 | 9 |

The returned groups win on count while carrying less evidence. The terms they
win with are `using`, `primary`, `to`, `at`, `and`, `or`,
`tables` — grammar and generic vocabulary. Group 9 matches `sqlite`,
`fts5`, `how`, `to`, `at`, `and`, `or`.

Four of the question's twenty terms — `explain`, `detect`, `runtime`,
`what` — appear **nowhere on the page**. A corpus question describes what it
wants answered; a reference manual states facts. They do not share vocabulary,
so no weighting of shared terms can separate the passage that answers from the
passage that merely reads like the question.

## Alternatives measured and rejected

Each was implemented test-first, measured over the full corpus, and withdrawn.
The baseline was 42.0, itself measured three times.

| Approach | Corpus score | Why it failed |
| --- | --- | --- |
| Structural Markdown from the DOM walk | 37.33 (×2) | Helps pages with real sections (URL canonicalization 55 → 66.667), hurts wherever a page's headings are its index or navigation (bun-webview 72.5 → 55) |
| Term-rarity weighting (fewer passages carrying a term ⇒ more weight) | 30.25 | Only held up by the structure it shipped with; without headings the cuts are arbitrary, so rarity measures where a page was cut |
| Down-weighting connectives | 40.25 | The deciding terms are ordinary content words, which no stop list catches |
| 4 passages per source | 42.0 | More text, not the missing evidence |
| 6 passages per source | 41.09 | Same, and the token budget degrades (5 → 2.5 on SQLite) |

Two further rankings were measured without shipping: repeat-count weighting
moves the holder from 18th to 12th of 145, and inverse document frequency moves
it to 36th. Two passages are returned.

## Decision

Lexical passage selection stays as it is. The `extraction` component is
recorded as unreachable under [ADR-0006](0006-codex-only-teacher-with-deterministic-grounding.md)'s
deterministic grounding, and `evidenceCoverage` is recorded as bounded well
below its 35-point weight for the same reason.

No threshold, weight, or corpus entry is changed to accommodate this.
`gates_release` stays `false`, as [ADR-0010](0010-defer-teacher-benchmark-release-gating.md)
requires.

## Consequences

Raising these two components requires selecting a passage by what it is about
rather than by which of the question's words it repeats. That is a decision
about [ADR-0006](0006-codex-only-teacher-with-deterministic-grounding.md)'s
deterministic boundary, not a tuning exercise, and it is not taken here.

The five withdrawals above are kept in the branch history rather than squashed
away. Each costs a 20-minute corpus run to rediscover.
