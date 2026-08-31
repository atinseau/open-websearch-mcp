# The corpus's acceptable patterns do not match its own captured passages

Status: accepted

Records a measured property of the `2026-08-30` teacher corpus. It changes no
requirement, no weight, and no corpus entry.

## Context

Two cases score 0 for evidence coverage with the cited page returned at rank 1
and its content correctly extracted. Investigating why led to the corpus rather
than to the product.

`evidenceCoverage` requires every `required_concept` of a claim to be grounded
in the returned text **and** at least one `acceptable_pattern` to match it. The
patterns are therefore the binding condition. Checked against the corpus's own
`evidence_passages` — the exact spans it captured from the cited pages:

| Case | Claim | Patterns absent from its own captured passage |
| --- | --- | --- |
| technical-url-canonicalization | c6 | 3 of 4 |
| technical-url-canonicalization | c8 | 2 of 5 |
| technical-sqlite-fts5 | claim_fts5_loadable_extension | 2 of 3 |
| technical-bun-webview | c1 | 1 of 2 |
| technical-bun-webview | c3 | 1 of 2 |
| technical-mcp-stdio | c4 | 1 of 3 |
| technical-pdfjs | c2 | 1 of 2 |
| multilingual-ja-web-standards | c2 | 1 of 3 |

**No claim in the corpus has a captured passage that satisfies all of its own
patterns: 0 of 8.**

The differences are wording, not substance. The WHATWG URL Standard writes
"single-dot **URL** path segment"; the pattern is `single-dot path segment`.
The same page's parser section says "invalid-URL-unit validation error"; the
pattern is `malformed \`%\` escapes`, a phrase that appears nowhere on the page,
in the captured passage, or in the raw 729KB of HTML.

A product returning the exact span the corpus points at therefore fails the
check the corpus applies to it.

## Alternatives measured and rejected

| Approach | Corpus score | Why it failed |
| --- | --- | --- |
| 4 passages per source, after navigation detection shipped | 69.45 | No gain over 69.5; the token budget degrades from 5 to 4.84 because the extra passages are text the corpus does not ask for |

Earlier passage-selection alternatives are recorded in
[ADR-0015](0015-lexical-passage-selection-limit.md). This ADR adds the reason
those attempts could not have succeeded on these claims: the target they aim at
is unreachable by construction, because the corpus's own evidence does not hit
it.

## Decision

The corpus is left exactly as sealed. Its patterns are not rewritten to match
its passages, its passages are not recaptured, and no threshold moves.
`gates_release` stays `false`, as
[ADR-0010](0010-defer-teacher-benchmark-release-gating.md) requires.

`evidenceCoverage` is recorded as bounded below its 35-point weight for a
reason independent of passage selection: on the claims above, no returned text
can satisfy the patterns, because the corpus's own captured evidence does not.

## Consequences

A future corpus refresh should derive `acceptable_patterns` from the captured
passage rather than authoring them alongside it, and verify each pattern
against its own passage before sealing. That is corpus work, not product work,
and `VER-001` already owns revisiting the corpus before the teacher benchmark
gates a release.

Until then, the measured scores stay what they are: a floor, not a ceiling. The
product is credited only where the corpus can see it.
