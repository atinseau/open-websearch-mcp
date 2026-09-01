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

### The patterns quote the teacher, not the page

The table above compares each pattern to the corpus's own captured passage.
The same patterns were later checked against the **live page as the product
renders it**, which is the text the grader actually reads. The failures are of
one kind: the pattern spells out a sentence the page never writes.

On `modelcontextprotocol.io/specification/2026-07-28/server/tools`, claim c5's
three patterns require the prose "method is `tools/list`", "optional cursor in
`params`" and "result includes a `tools` array". None occurs. The page states
the same facts as a JSON request block — `"method": "tools/list"` with
`"params": { "cursor": ... }` — and never narrates it. All three patterns fail
on a page rendered whole, at rank 1, carrying the answer.

On `bun.com/docs/runtime/webview`, claim c3 requires "Chrome `backend.url`
option is a Chrome-only `ws://` URL". The strings `backend.url` and
`Chrome-only` appear nowhere in the page's 27,145 rendered characters. The
page writes the same fact as a parameter table row: "url string | false
(chrome only) ws:// URL of an existing Chrome's DevTools endpoint, or false to
skip auto-detect and always spawn."

A neighbouring pattern shows how narrow the miss is. Claim c4 requires
"connects over WebSocket instead of spawning"; the page reads "Bun connects to
that browser over WebSocket instead of spawning a new one". Same clause, four
words inserted.

This is the same finding as the table above, confirmed from the other
direction: the patterns describe how a teacher summarised a page, and a
deterministic grader can only match what the page says.

### A captured table is not the table the page renders

`technical-bun-webview`'s first claim cites a 1,084-character passage that is
the WebView options table. The corpus captured it with its cells separated —
`Option Type Default Description` — and the renderer returns them run
together: `optiontypedefaultdescriptionwidthnumber800viewport width in css
pixels`. The rendered `text` and `markdown` are byte-identical, so the cell
boundaries are gone before extraction sees the document, and no grader-side
reading can restore information the page text no longer carries.

Comparing the two with **all** whitespace removed — the most permissive
reading available, and one that would be indefensible to ship — still does not
find the passage. So the difference is not only the cell boundaries: the two
texts diverge in their characters, and this passage is out of reach for a
reason no normalisation addresses.

That claim is one of two carrying a passage on this case, which is why its
`extraction` scores 5 of 10 rather than 10.

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
