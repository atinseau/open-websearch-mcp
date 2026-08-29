# WEB-005 — passage extraction defects found by adversarial review

Task: `WEB-005`
Attempt: `arch-bench-a1`
Branch/worktree: `agent/arch-bench-a1` / `.worktree/arch-bench`

## Why this correction exists

ADR-0011 recorded, as incidental evidence, that `web_open` returned zero
passages for a cited page. That was treated as a limitation of the capture
surface. It was not: it was a product defect, and it hid three more.

A live `web_open` call against `https://bun.sh/docs` and
`https://modelcontextprotocol.io/specification/2025-06-18` returned
`status: success` with **zero passages**. A successful call that yields no
evidence is worse than a failed one, because nothing signals the loss.

## Defects, each reproduced before it was changed

1. **Oversized blocks were discarded.** `groupText` dropped any block longer
   than 1,200 characters. The renderer returns `innerText`, whose paragraphs
   are separated by single newlines rather than the blank lines Markdown
   requires, so a whole page arrived as one oversized block and was thrown
   away. Now split on sentence boundaries.

2. **Sanitization flattened every newline.** `sanitizeExternalHtml` collapsed
   all whitespace, so one inline tag in rendered Markdown destroyed every
   paragraph boundary. Measured: a document with two passages dropped to zero
   after a single `<a>` was added. Blank lines are now preserved.

3. **The non-HTML path never sanitized.** Markdown legitimately carries inline
   HTML, so raw markup reached evidence through that branch. The value is now
   sniffed. Separately, `innerText` captured inline script bodies as
   "evidence"; the renderer now strips non-content nodes from a detached clone
   before reading text.

4. **Headingless passages deduplicated against each other.** `select` treated
   `undefined === undefined` as a shared heading, so every headingless slice
   collapsed into one. Whichever block scored first — usually navigation
   chrome — replaced the entire page. Found by adversarial review, not by me.

5. **Every document was labelled `text/html`.** A public PDF therefore had its
   raw bytes parsed as markup and returned as passages. The renderer now reads
   the declared `content-type` from the main-document CDP response and
   propagates it, so `EXTRACT-002` returns `unsupported_or_ocr_required`.

6. **Concealment tests were incomplete.** Unquoted `style` values, `noscript`,
   and bare `hidden` all leaked; `aria-hidden=false` wrongly removed visible
   content because `hidden` matched the tail of the attribute name.

## Evidence

Before: `bun.sh/docs` → 1 passage of navigation chrome; RFC PDF → 10 passages
of binary noise. After: `bun.sh/docs` → 5 passages, 4 substantive; RFC PDF →
`unsupported_or_ocr_required`, 0 passages.

Regression tests added for each class: `EXTRACT-004` covers eight concealment
vectors plus the content that must survive, `EXTRACT-009` proves chrome no
longer erases substantive text, and `EXTRACT-002` proves PDF routing.

`bun run check`: 238 pass, 1 informational live skip, 0 fail.

## What this does not change

ADR-0010 and ADR-0011 still stand. A corrected `web_open` produces
product-derived passages, so using them as the extraction denominator would
remain self-referential. Only ADR-0011's incidental claim that `web_open`
cannot expose passages is now obsolete; its reasoning is not.

