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

### Two passages joined cannot reconstruct a 2,478-character capture

`technical-pdfjs`'s only evidence passage is 2,478 characters against a
1,200-character passage size, so no single group can hold it. The grader joins
a page's returned passages with a newline before comparing, which raised a
possibility worth measuring: if the capture spans adjacent groups and both are
returned, the joined text would carry it.

Measured, `mozilla.github.io/pdf.js/examples/` yields three groups, and two of
them do cover the capture — one starting at offset 911 of it, the other at
2,090. They are returned ranked rather than in document order, so the joined
text reads the second half before the first.

Returning them in document order was implemented and measured. The joined text
still does not carry the capture: two groups of at most 1,200 characters
cannot span 2,478, whichever order they are in, and the third group is
navigation chrome that scores below both. The change was withdrawn — it also
contradicts `TOOL-001`, which holds that a focused page leads with the
passage that answers the focus rather than with whatever the page opens on.

This case is therefore bounded by the capture's length against `MCP-012`'s
two passages of about 1,200 characters, which is why it scores 90 with
`extraction` at 0.

### The Japanese case is bounded twice over

`multilingual-ja-web-standards` scores 5 with every component at 0 but the
token budget, and the cause is not one defect but two in series.

Discovery was the first. The follow-up query kept the question's framing words
— 一次情報, 公式仕様 — and derived `日本語 一次 情報 公式`, naming nothing
the question is about. Reading those as framing in Japanese as well as in
English derives `URL 国際 ドメイン ブラウザー`, and the expected source moves
from third place in the candidate pool to first, with a second copy of it
alongside.

The score did not move, because the source that discovery now leads with is
`www.nic.ad.jp`, every page of which fails to render: measured across its
`idn.html`, `system.html`, `dom/` and `index.html`, all four exhaust the
renderer's full thirty-second navigation deadline and return nothing, while
`jprs.jp` and Japanese Wikipedia render from the same browser in seconds.

Of the claim's six accepted sources, that unrenderable host is the only one
discovery surfaces at all. The others — `jprs.jp/glossary`, two IETF RFCs,
`url.spec.whatwg.org` and `unicode.org/reports/tr46/` — are absent from the
pool under every query measured, including the question itself, its keywords,
and three hand-written technical phrasings.

The discovery fix is kept because it is correct on its own terms and the
English questions derive exactly what they derived before. This case stays
bounded by what the engines return for it.

#### Five of its six accepted sources render; discovery reaches none of them

Each accepted source was opened directly:

| Source | Result |
| --- | --- |
| `www.nic.ad.jp/ja/dom/idn.html` | error after 18s, 0 characters |
| `jprs.jp/glossary/index.php?ID=0051` | success, 2,137 characters |
| `datatracker.ietf.org/doc/rfc5890/` | success |
| `datatracker.ietf.org/doc/html/rfc3492` | success |
| `url.spec.whatwg.org/` | success, 2,277 characters |
| `unicode.org/reports/tr46/` | success, 1,704 characters |

So the case is not bounded by rendering. Five sources are renderable and
discovery surfaces none of them under any query measured; the sixth is the
only one it does surface, and it is the one that fails.

The scoped pass makes this worse rather than better. It derives
`site:nic.ad.jp`, and the pool it produces is 11 `nic.ad.jp` pages out of 23 -
close to half a pool spent on a host where every page fails. `HostAllowance`
stops the search after two of them, so the remaining nine are candidates that
can never be reached, and a navigation was spent deriving them.

The scoped pass cannot know this. It runs inside discovery, before anything is
rendered, while the host's failures are only learned later in `fill-results`.
Carrying that knowledge backwards would make one call's rendering outcomes
decide another call's discovery, which is a larger change than this case
justifies and is not made here.

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

## The Japanese case needs a query in a language it is not written in

Three measurements narrow that case to one cause.

The requested locale is not it. The same query returns the same ten results
from DuckDuckGo under `hl=ja-JP` and `hl=en-US`, with `nic.ad.jp` — the one
unrenderable source — the only accepted source in either.

The query's language is. Asked in English, the same subject reaches sources
the Japanese phrasing never does:

| Query | Accepted sources reached |
| --- | --- |
| `URL 国際 ドメイン ブラウザー` (what the product derives) | `nic.ad.jp`, which cannot render |
| `IDNA UTS46 ToASCII internationalized domain name browser` | `unicode.org/reports/tr46/` |
| `WHATWG URL Standard host parser IDNA ToASCII` | `url.spec.whatwg.org/` |

Both English phrasings reach a renderable accepted source, and neither can be
derived. The question contains exactly one Latin term, `URL`; `IDNA`, `UTS46`
and `ToASCII` are technical vocabulary a translation would have to supply, and
the product holds no lexicon and no model.

Taking identifiers from the pages the first pass did reach was measured as the
deterministic alternative. Those pages do carry Latin identifiers —
`Punycode`, `IDNA`, `ASCII`, `Unicode`, `RFC` — so a follow-up built from them
invents nothing. Three such queries were issued and reached no accepted
source: the terms that worked were `UTS46` and `ToASCII`, which appear on none
of the reachable Japanese pages.

So this case needs a query in a language the question is not written in,
carrying terms the question does not contain and the reachable pages do not
supply. That is outside
[ADR-0006](0006-codex-only-teacher-with-deterministic-grounding.md)'s
deterministic boundary rather than a defect in discovery.
