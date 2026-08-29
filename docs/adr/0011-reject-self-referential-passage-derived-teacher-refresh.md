# Reject self-referential passage-derived teacher refresh

Status: accepted

Amends [ADR-0010](0010-defer-teacher-benchmark-release-gating.md); it does not
supersede its release-gating decision.

## Context

The sealed `2026-08-28` Codex-only refresh contains 18 accepted claims but no
URL-located evidence passages. Codex `exec --json` exposed cited URLs but not
the Web result payloads from which a teacher could select a supporting span.

The proposed remedy was to render each Codex-cited URL with Open WebSearch MCP
and store its returned evidence passages in a new immutable refresh. This would
retain Codex as the only teacher and avoid the retired Claude capture path.

## Decision

Reject this as a passage-bearing *teacher* refresh and retain ADR-0010's
deferred release gate.

The Codex-cited URLs are valid teacher-derived source-selection evidence. A
product-produced passage is not teacher-derived evidence: it is output of the
same renderer and extractor whose extraction behavior `TEST-013` and the
10-point extraction component must evaluate. Comparing that extractor to its
own previously captured output would guarantee passage preservation by
construction, not measure extraction correctness, noise, structural fidelity,
or the quality of a competing extractor.

The overlap does have limited legitimate value. With immutable provenance that
labels it as derived by the product pipeline, it could support diagnostic
measurements of source recall, rank, duplicate control, token use, and
teacher-claim lexical coverage. It cannot supply the extraction denominator,
produce a `TEST-015` total, classify a `TEST-016` conformity score, or support
`TEST-017` promotion. Those components must remain explicitly excluded rather
than renormalising the fixed weights or treating self-match as a pass.

The trial also established that the currently implemented `web_open` path is
not yet a passage-exposing capture path for this purpose. Its renderer provides
plain rendered text as `markdown` while declaring `text/html`; the extractor
sanitizes it as HTML, removes heading structure, and drops the resulting
over-1,200-character block. The cited Bun WebView page therefore returned zero
runtime passages. Obscura's separate `fetch --dump markdown` command did
produce structured passages, but using it would be a parallel capture pipeline,
not an observation of `web_open`, and would not cure the circularity.

## Consequences

- The sealed `2026-08-28` corpus is untouched and remains immutable.
- The deterministic grader, its 14/6 split, weights, thresholds, and promotion
  guard are untouched; its current `unmeasurable` result remains the real
  benchmark result.
- A future remedy must capture source-located passages selected or exposed by
  an independent, passage-exposing teacher/capture surface, then distinguish
  that teacher evidence from product-derived diagnostics in the fixture schema.
- Fixing `web_open` passage structure is valuable product work, but alone does
  not make its output independent extraction ground truth and does not close
  ADR-0010.

## Amendment — the observed passage defect is fixed

The zero-passage behaviour recorded above was a real product defect, not a
property of `web_open`, and it has since been diagnosed and fixed.

Three separate faults combined to erase a page's evidence:

1. `groupText` discarded any block longer than 1,200 characters outright. A
   renderer that returns plain page text produces exactly one such block,
   because `innerText` separates paragraphs with single newlines rather than
   the blank lines Markdown requires. Oversized blocks are now split on
   sentence boundaries instead of dropped.
2. `sanitizeExternalHtml` collapsed every newline into a space, so a single
   inline tag in rendered Markdown destroyed all paragraph boundaries. Blank
   lines are now preserved.
3. The non-HTML branch of `documentText` never sanitized, so raw markup
   reached evidence through the Markdown path. The value is now sniffed, and
   the renderer strips `script`, `style`, and other non-content nodes before
   reading text, which previously let inline JavaScript become a "passage".

This changes none of the reasoning above. The corrected `web_open` still
produces *product-derived* passages, so using them as the extraction
denominator would remain self-referential. The rejection stands; only the
incidental claim that `web_open` cannot expose passages is now obsolete.
