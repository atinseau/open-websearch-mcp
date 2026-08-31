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

### Why no weighting can separate them

Scoring by term count does not merely pick the wrong passage on these pages; on
the page it was measured against it stops discriminating at all. Grouped as the
extractor groups them, SQLite's FTS5 page yields 145 passages, and **42 of them
tie at the top score**. The passage holding the expected evidence is one of the
42, ranked 16th by an ordering that is arbitrary among equals.

The terms deciding those ties are `using`, `primary`, `support`, `and` and
`tables` - ordinary vocabulary a reference manual repeats on every page. The
passage that answers matches `sqlite`, `how`, `to`, `fts5`, `at`, `and`, `or`;
the two returned match nine terms each, differing only by that filler.

A weighting scheme reorders a ranking. It cannot break a 42-way tie whose
members are indistinguishable to the feature being weighted.

### The evidence is reachable; the ranking cannot reach it

Two passages are enough, in principle. On SQLite's FTS5 page the patterns for
both of the case's claims sit in group 9 (`loadable extension`,
`sqlite3_fts_init`, `sqlite3_fts5_init`) and groups 34/37 (`content=`, the
`content_rowid` pattern). Sixteen of the 145 grouped passages carry at least one
expected pattern, so the target is not out of reach by construction.

The ranking cannot deliver them. Group 9 ranks 16th and group 37 ranks 20th,
where two are returned. A redundancy rule was measured on the same page - refuse
a second passage sharing 40% or more of its vocabulary with the first - and it
changes the second pick from group 138 to group 29 without reaching either
target. The two passages the product returns overlap 43%, so they are close to
redundant already, and removing that redundancy does not move a group ranked
16th into the top two.

### The ceiling is arithmetic, not a matter of tuning

Fourteen of SQLite's 145 grouped passages score **strictly above** the passage
holding the expected evidence, and 27 more tie with it. A tie-break decides only
the order among equals, so the best rank that passage can reach under any
tie-breaking rule is **15th**, and the worst is 42nd. Two passages are returned.

That bound holds however the tie is broken, so no refinement of the tie-break
can lift it. Only a rule that changes which passages score *above* it could, and
the deciding terms there are `using`, `primary`, `support`, `and`, `tables` -
the vocabulary a reference manual repeats everywhere.

Three further rankings were measured against this bound and did not clear it:

| Ranking | Rank of the passage holding the evidence |
| --- | --- |
| Current term count | 16th of 145 |
| Term frequency (occurrences, not presence) | 17th |
| Terms rare within the page only | 22nd |
| Identifier-shaped terms weighted 3x | 24th |
| Code-shaped tokens weighted | 12th |

The best of them reaches 12th against a floor of 15th for tie-breaking alone,
which is the measurement that closes this line of work: the gap is not one a
scoring function of surface features can close.

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
