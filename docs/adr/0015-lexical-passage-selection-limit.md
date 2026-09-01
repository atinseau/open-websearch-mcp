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

### A deeper budget for the leading source, measured and withdrawn

The 4-passage and 6-passage rows above raise every source at once, which costs
about four times the tokens. A narrower variant was measured separately:
spend the unused budget on the best-ranked source alone. A search spends
roughly 3,000 tokens of the grader's 6,000 across four corpus cases, so one
source at eight passages fits inside that headroom.

Extracted in isolation from a full render, it looked decisive: at eight
passages SQLite's FTS5 page carries `loadable extension` and the WHATWG URL
Standard carries its third claim's pattern, where two passages carry neither.

It was implemented, and the corpus scored **61.46 — unchanged**, with
`evidenceCoverage` still 0 on both cases. The leading source did receive its
eight passages on every run, and `loadable extension` was in none of them,
three runs out of three.

The isolation measurement had extracted without a focus. Asked for the same
page at the same budget, once with no focus and once with the corpus question
as focus:

| Focus | Passages | Carries `loadable extension` |
| --- | --- | --- |
| none | 10 | yes |
| the corpus question | 10 | no |

The focus does not fail to find the evidence: it ranks it out. Ten passages
chosen by the question exclude a passage that ten passages chosen by nothing
include. This is the same bound as the rest of this record, reached from the
other side — more passages do not help while the ordering that fills them is
the one being measured.

The change was withdrawn rather than kept: it also contradicts `MCP-012`,
which fixes two passages per source, and it bought nothing to weigh against
that.

### Focusing extraction on the question's distinctive terms, measured and rejected

This record's diagnosis is that the terms deciding a tie are grammar and
generic vocabulary. `keywordFollowUp` already strips exactly those — it exists
because engines answer a verbose question with a site's front page — and it had
never been tried as the extraction focus. Three focuses were measured on the
four cases that carry a URL-located passage, asking where each expected passage
ranks among the page's groups:

| Case | Passage | Question | Keywords | Both |
| --- | --- | --- | --- | --- |
| technical-sqlite-fts5 | 228 chars | 14th | **4th** | 14th |
| technical-url-canonicalization | 261 chars | 52nd | 49th | 52nd |
| technical-url-canonicalization | 224 chars | 54th | 62nd | 54th |
| technical-bun-webview | 1,084 chars | absent | absent | absent |
| technical-bun-webview | 249 chars | **1st** | 3rd | 2nd |
| technical-mcp-stdio | 934 chars | **1st** | absent | **1st** |

Keywords help exactly where this record said the noise was — SQLite's passage
moves from 14th to 4th — and lose the two passages that are currently reached.
Two passages are returned, so what matters is how many land in the top two:
the question reaches two, keywords reach none, both reach one.

The distinctive terms are the wrong instrument here for a reason worth
recording: a keyword query is built to make an *engine* return the right page,
where breadth is a liability. Choosing a passage inside a page it has already
found is the opposite problem — the surrounding words are what identify the
section — and the same reduction that sharpens the first blurs the second.

### Refusing candidates that match only scaffolding, measured and rejected

A candidate pool carries visible noise. Measured live, the Bun.WebView
question — which opens "According to current official Bun documentation" —
returned four dictionary entries for the phrase "according to" from
WordReference, Reverso, Cambridge and Larousse; the WHATWG URL question
returned four pages about Windows Terminal's quake mode, and on another run
four `ccm.net` pages including a PDF converter and two Spanish medical
articles. They arrive last in the pool, where the later engines widen it.

The widening is not the defect: on the MCP question it contributes accepted
sources as deep as twentieth place, and on PDF.js as deep as eighteenth.

Refusing a candidate that shares no subject term with the question was
implemented against a failing test and then withdrawn, because the
discriminator does not exist. Only a title and a URL are known before
rendering, and against the Bun.WebView question:

| Candidate | Lexical coverage |
| --- | --- |
| `wordreference.com/enfr/according to` — a dictionary | **0.105** |
| `bun.com/docs/runtime/webview` — the expected page | 0.053 |

The noise scores twice what the answer scores, because a dictionary entry for
a phrase repeats that phrase and a documentation page states its subject once.
No threshold on this signal separates them, and admitting on the engine's own
judgement is what the pool already does.

### What two passages could reach, computed exhaustively

Earlier sections measure where the expected passage ranks. A stronger question
is whether *any* pair of a page's groups satisfies a claim, since two are
returned. That is decidable by enumeration rather than by another corpus run.

Every pair of groups was tested against each claim's concepts and patterns:

| Case | Claim | A satisfying pair |
| --- | --- | --- |
| technical-url-canonicalization | 0 | none |
| technical-url-canonicalization | 1 | groups 0 + 52 |
| technical-url-canonicalization | 2 | groups 0 + 54 |
| technical-sqlite-fts5 | 0 | groups 0 + 14 |
| technical-sqlite-fts5 | 1 | none |

Three claims are reachable within the two-passage budget, and every satisfying
pair contains group 0 — which the product already returns. Exactly one passage
is missing in each case, at rank 52, 54 and 14.

Read against the whole of every accepted source, seven of these cases' eleven
claims are reachable at best, and four are not: they fail on a concept or a
pattern the pages never carry, which is
[ADR-0016](0016-corpus-patterns-do-not-match-captured-passages.md)'s finding.

So the ceiling is not uniform. Two cases are bounded by the ranking rather
than by the corpus, worth about 39 points between them, and the gap is one
passage each.

### Weighting a section's own title, measured and rejected

A section title is a page's claim about what follows, and it is weighted no
differently from the prose beneath it. On SQLite's page the missing group opens
with `2.2. Building a Loadable Extension`, which names the claim exactly.

Counting a question's terms twice when they appear in a group's opening title
line was measured. It changes which passages are chosen — SQLite picks 8 and
47 rather than 0 and 1, URL canonicalization picks 1 and 0 rather than 0 and
47 — and satisfies no additional claim on either case. It also loses group 0,
which every satisfying pair needs.

On the WHATWG page the missing groups score 0.8 against a leading 12, so no
bonus of this size reaches them; on SQLite's the missing group scores 7
against 9, and the title bonus moves other groups further.

### Choosing the second passage for what it adds, measured and rejected

Every satisfying pair is `0 + X`, so the second pick should arguably be chosen
for what it adds to the first rather than for its own score. Three complement
rules were measured against the enumerated ground truth: terms the first pick
does not already carry; the same tie-broken by own score; and a preference for
normative wording — the "is a", "must", "if … then" a specification uses to
define or prescribe — with citation lists excluded.

None satisfies an additional claim on either case. The rules pick groups 9, 6,
47 and 2 where the winners are 14, 52 and 54.

### The pair is bounded arithmetically, as the single passage was

The earlier bound in this record is about where one expected passage can rank.
The same computation on the *pair* closes the line that the enumeration above
opened:

| Case | Second passage needed | Groups scoring strictly above it | Best reachable rank |
| --- | --- | --- | --- |
| technical-sqlite-fts5 | group 14 | 15 | 16th |
| technical-url-canonicalization | group 52 | 12 | 13th |
| technical-url-canonicalization | group 54 | 12 | 13th |

Two passages are returned. These are not ties a tie-break could settle: twelve
to fifteen groups share strictly more of the question's terms than the passage
that answers it. A rule reaching them must demote passages that are, by the
only signal available before reading, more relevant.

That is the same conclusion as the rest of this record, now established for
the pair rather than for the passage, and it closes the direction the
enumeration suggested.

### The two low cases are the two without a scoped ask, and that is not the cause

A correlation stands out across the corpus: every case that spends a scoped
`site:` ask scores well — PDF.js 90, Bun WebView 86.25, MCP 82.5 — and the two
that do not are the two at 55.

They do not spend it because `arrived` reports the search has already reached
the source. That report is literally true and looks wrong: on
`sqlite.org/fts5.html` the question's term `fts5` is in the path, so arrival is
declared at the page that names the subject rather than at the section
answering the question.

The ask was issued directly to see what it would have found. On
`site:sqlite.org SQLite detect FTS5 support` it returns `fts5.html` and
`search?q=fts5` — the pages the first pass already had — then `docs.html`,
`sqlite.org/` and three forum posts. On
`site:whatwg.org WHATWG URL Standard normalization` it returns
`url.spec.whatwg.org/`, `spec.whatwg.org/`, `whatwg.org/`, the wiki, and two
blog posts.

Neither surfaces a page the first pass missed, and neither reaches the anchored
sections the corpus cites — those are anchors within a page already held, not
separate documents an engine can return. The correlation is real and the
causation runs the other way: these two cases cite sections of a single page,
which is also why their passages must be selected rather than discovered.

### Stripping page chrome before extraction, measured and rejected

The renderer removes `script`, `style`, `noscript`, `template` and `svg` from
the DOM it reads. It keeps `nav`, `header`, `footer` and `aside`, which are
chrome by definition: a site's menu appears on every one of its pages and
answers no question. Removing them too was measured on each case, reading both
versions from the same loaded DOM:

| Case | As read today | With chrome removed | Claims satisfied |
| --- | --- | --- | --- |
| technical-sqlite-fts5 | 159,658 chars | 159,658 | 0 → 0 |
| technical-url-canonicalization | 143,215 | 141,849 | 0 → 0 |
| technical-bun-webview | 27,711 | 25,928 | 3 → 3 |
| technical-pdfjs | 3,550 | 3,053 | 1 → 1 |

Chrome is 1% to 14% of a page and no claim changes. SQLite's page has no
chrome elements at all — its navigation is a table — which is why the
structural-Markdown attempt above helped some pages and hurt others.

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

### Passage ranks in this record are not directly comparable

The rank figures above — 14th of 145, 52nd of 104, 16th at best — were each
measured by opening a page with a large `maxChars` budget. That budget changes
the grouping itself, not only how many groups are returned: `url.spec.whatwg.org`
yields 10 groups at the default budget and 21 at 900,000 characters, and an
earlier measurement of the same page reported 104.

So a rank is meaningful only against the grouping it was taken from, and the
enumerated pairs `0+52` and `0+14` describe one grouping while a search sees
another. Re-enumerated over the grouping a deep extraction of the rendered body
produces, the satisfying pairs are `0+3` for SQLite's first claim and `1+17`
for the URL Standard's third — nearer than the earlier numbers suggest, and
still outside the two passages returned.

Two probes over that same grouping disagreed on whether four passages satisfy
SQLite's first claim, because `conceptGrounded` is proximity-based and its
verdict moves with how the joined text is normalised. That disagreement is not
resolved here, so no claim is made about what a deeper budget would score.

What stands is the bound this record establishes by arithmetic rather than by
sampling: the passage carrying the evidence is outscored by more groups than
the two that are returned, whichever grouping it is measured in.

## Why two readings of one page can disagree

`conceptGrounded` accepts a concept two ways. Its tokens may be *adjacent* —
joined by any run of non-alphanumeric characters, of any length — or they may
be within `conceptProximityWindow`, 160 characters measured between the
outermost matched tokens.

The window is a character count, so collapsing whitespace moves it. Measured
directly, with the same words in the same order and other words between them:

| Reading | Length | `entry-points` grounded |
| --- | --- | --- |
| as a source file wraps it | 350 chars | **no** |
| whitespace collapsed | 166 chars | **yes** |

The adjacent rule hides this for most concepts: `entry` followed by two
hundred newlines and `points` matches it, because the separator is entirely
non-alphanumeric. The window is only consulted when other *words* sit between
the tokens, and that is exactly where a wrapped page and a flattened one part
company.

This matters because the two sides of the benchmark read differently.
`evidenceCoverage` grounds concepts in `flattened` text — whitespace collapsed
— while `selectEvidencePassage` grounds them in `normalized` text, which keeps
the wrapping. A concept can therefore be grounded for the grader and not for
the capture, or the reverse.

Nothing is changed here. The corpus is sealed, the grader's reading is the one
[ADR-0016](0016-corpus-patterns-do-not-match-captured-passages.md)'s correction
verified against, and altering either would move a measurement rather than a
behaviour. It is recorded because a probe that normalises differently from the
grader will disagree with it, which is how this was found.

### Twenty-one passages per source, measured through the grader

Earlier attempts in this record measured passage depth with hand-written
predicates that normalise differently from the grader, and one of them
contradicted itself. This measurement calls `gradeCase` directly, so the
comparison is the benchmark's own.

Substituting a deep read of each case's leading source, keeping every other
source as the search returned it:

| Case | Two passages | Leading source read deep |
| --- | --- | --- |
| technical-sqlite-fts5 | 55 | **81.44** |
| technical-url-canonicalization | 55 | 54.36 |
| technical-mcp-stdio | 82.5 | 82.5 |
| technical-bun-webview | 86.25 | 86.25 |
| technical-pdfjs | 90 | 90 |

SQLite's page yields 21 passages at any budget above that, which is 23,385
characters — 15% of the page, not the whole of it. Its first claim is
satisfied only at 21; three, four, six, eight and twelve all score zero, so
there is no intermediate setting that buys the gain more cheaply.

Run over the corpus with `search_passages_per_source = 21`, which is
configuration rather than a code change (`CONFIG-004`), the mean moves
**62.29 → 62.85**. The gain on SQLite is real and large, and it is almost
entirely spent: `tokenBudget` falls from 5 to 0 on three cases and the
Japanese case drops from 5 to 3.5.

So the setting trades a 22-point gain on one case for five points of budget on
three others, and nets 0.56. It is recorded rather than adopted: `MCP-012`
fixes two passages per source by default, the corpus is the only evidence that
21 is better, and a token budget spent on one page is a cost every caller pays
whether or not their question resembles this corpus.

### The earlier depth measurement was capped by `web_open`, and understated the gain

The measurement recorded above went through `web_open`, which `MCP-003` caps
at 25,000 characters — 21 passages at 1,200 each. The search path passes
`maxPassages` instead and is not capped that way, and the pages yield far more
groups than 21: 104 for the WHATWG URL Standard, 145 for SQLite's FTS5 page.

Re-measured on the uncapped path, grading through `gradeCase`:

| Case | 2 | 21 | 40 | 60 | 104 |
| --- | --- | --- | --- | --- | --- |
| technical-url-canonicalization | 55 | 55 | 54.0 | **84.4** | 83.3 |
| technical-sqlite-fts5 | 55 | **82.1** | 80.9 | 77.9 | 77.1 |

So `url-canonicalization` is **not** bounded by passage ranking, which this
record concluded from a capped measurement. Its evidence sits past passage 40
and is reachable at 60.

Run over the corpus with `search_passages_per_source = 60`:

| | mean | url-canon | sqlite | multilingual-ja |
| --- | --- | --- | --- | --- |
| two passages | 62.29 | 55 | 55 | 5 |
| sixty passages, run 1 | **70.28** | 83.3 | 77.1 | 17.5 |
| sixty passages, run 2 | **73.20** | 83.3 | 77.1 | 35 |

Both runs are large gains, and the Japanese case moves for the first time in
this record — from 5 to 17.5 and 35 — because more of each page reaches the
grader. `tokenBudget` is 0 on every case, which is the whole of the cost.

### Why it is recorded rather than adopted

`MCP-012` fixes two passages per source of about 1,200 characters. Sixty is
thirty times that, and `tokenBudget` scoring zero everywhere is the benchmark
saying the answer is too long, not that it is better.

The corpus rewards recall and charges almost nothing for length: five of the
hundred points. A caller pays that length on every call. Changing the default
is a product decision about what `web_search` returns, not a tuning choice,
and it belongs with whoever owns `MCP-012`.

What this does establish is that two of the three cases this record treats as
ranking-bound are not: their evidence is reachable, at a token cost the
benchmark barely prices.
