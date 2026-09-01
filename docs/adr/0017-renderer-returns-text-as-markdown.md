# The renderer returns page text as its Markdown, so no code block is ever extracted

Status: accepted

Records a measured defect and the reason it is not fixed by switching
renderers. It changes no requirement and no threshold.

## Context

`EXTRACT-006` requires legitimate code blocks to be preserved separately, with
a language where identifiable. `EXTRACT-001` lists code blocks among the
formats V1 covers, and `MCP-005` puts them in every response envelope.

In production, no page ever yields one. Measured on
`modelcontextprotocol.io/specification/2026-07-28/server/tools` and
`bun.com/docs/runtime/webview`, the rendered document contains **zero** fenced
code blocks and its `markdown` is byte-identical to its `text`.

The cause is in `webview-renderer.ts`: the renderer evaluates `innerText` on a
cleaned clone of the live DOM and assigns that string to both `text` and
`markdown`. Extraction finds code by reading Markdown fences, so a document
with no fences has no code, and `codeBlocksFrom` returns an empty array on
every HTML page.

[SPK-004](../spikes/SPK-004/report.md) measured 468 fenced code blocks, 786
headings and 6 tables across the same corpus. It reached them through
`obscura fetch --dump markdown`, which the product does not use. Run directly
against SQLite's FTS5 page, that command still returns 169,309 characters
carrying 222 code fences and 87 headings, against the 20,548 characters of
flat text the product sees.

## Why the renderer is not switched here

Feeding Obscura's own Markdown into the existing extractor was measured. It
works: the same page yields 111 code blocks instead of none, so `EXTRACT-006`
becomes satisfiable.

It also moves the corpus's expected passage out of reach. That passage was
captured from rendered page text, and against structured Markdown the same
page groups into 84 passages that do not contain it — where flat text groups
into 145 and holds it whole at rank 14.

This is the same finding
[ADR-0015](0015-lexical-passage-selection-limit.md) records for structural
Markdown from the DOM walk, which scored 37.33 against a 42.0 baseline: it
helps pages whose headings are real sections and hurts wherever a page's
headings are its navigation.

That first comparison was made on one case. Extended to every case carrying a
measurable claim, with the same extractor and the same two-passage budget:

| Case | Claims | Satisfied today | Satisfied from native Markdown | Code blocks recovered |
| --- | --- | --- | --- | --- |
| technical-bun-webview | 4 | 3 | 3 | 31 |
| technical-mcp-stdio | 2 | **1** | **0** | 24 |
| technical-pdfjs | 1 | **1** | **0** | 5 |
| technical-sqlite-fts5 | 2 | 0 | 0 | 111 |
| technical-url-canonicalization | 3 | 0 | 0 | 17 |

Native Markdown recovers 188 code blocks across these pages and satisfies no
claim that flat text does not already satisfy, while losing two. The
regression is not confined to the case first measured.

## Decision

The defect is recorded rather than fixed. `EXTRACT-006`, `EXTRACT-001` and
`MCP-005` are not satisfied for HTML pages, and no test covers the gap because
the extractor's own fixtures supply Markdown directly.

Switching the renderer to Obscura's Markdown is a change to what every
downstream component reads. It should be taken as its own task, measured over
the full corpus, and paired with a corpus refresh — the captured passages were
taken from rendered text and would need recapturing against whatever the
renderer emits.

A narrower option exists and is recorded rather than taken: keep flat text for
passages and read code blocks from native Markdown, so `EXTRACT-006` is met
without moving passage selection. `ExtractionInput` already separates
`renderedText` from `markdown`, but `document-text.ts` prefers `markdown`
wherever it is present, so both readings cannot coexist without giving the
extractor two bodies and deciding per output which to read. That is a change
to the extraction seam, not a setting, and it belongs with the task above.

## Consequences

A caller relying on `code_blocks` receives an empty array from every HTML
page and cannot tell that from a page with no code. That is the user-visible
cost of leaving this open, and it is larger than the benchmark's, which is
zero: the corpus's patterns ask for prose, not for code.
