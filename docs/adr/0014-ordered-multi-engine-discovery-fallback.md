# Fall back across ordered search engines when discovery is blocked

Status: accepted

Amends [ADR-0001](0001-google-discovery-obscura-rendering.md), `PROD-003`, and
`SEARCH-001` through `SEARCH-007`. It does not change rendering, extraction,
ranking, caching, or the two public MCP tools.

## Context

Discovery had a single point of failure. When Google refused a search the
product returned nothing, although everything else worked: the renderer opened
those very pages, the extractor read them, and `web_open` succeeded on the same
URLs.

The refusal was measured, not assumed. From one network, one binary, one
session:

| Surface | Result |
| --- | --- |
| `google.com/search`, including `gbv=1`, `udm=14`, `nfpr=1`, a warmed profile, and consent cookies | CAPTCHA |
| `google.co.uk/search` | CAPTCHA |
| `scholar.google.com` | served, stable over four queries |
| `google.com/complete/search` | served |
| DuckDuckGo HTML, Bing | served, stable over four queries |

Google's own Scholar and suggestion endpoints answered while `/search` refused.
That rules out both address reputation and renderer fingerprint: it is a
path-specific anti-automation defence.

**Stealth mode was already enabled and already working.** The supervisor has
always passed `--stealth` to Obscura. Without it Google refuses immediately;
with it, several Google surfaces answer. This was not a missing setting, and no
amount of tuning one engine would have fixed it.

## Decision

Discovery consults an ordered list of engines and moves to the next only when an
engine produced no answer at all. Google stays first by default, followed by
DuckDuckGo and Bing.

The list is configuration, not code: `search.engines` in the workspace TOML. An
operator can reorder the engines or drop one without a code change, and a
misconfiguration fails at load rather than at search time.

**Only a non-answer falls through.** `blocked` and `error` advance to the next
engine. `empty` and `parse_failure` stop the chain: an empty result is a
legitimate answer, and retrying elsewhere would replace a true absence of
results with another index's noise, while a parse failure is our own defect,
which falling back would hide behind an engine that happens to work.

**Provenance travels with the result.** Each result reports the engine that
produced it, so an answer can be attributed and a configured order can be seen
to have taken effect.

## Measured result

A live `web_search` on the blocked network returned `success` with five real
candidates for "sqlite fts5 external content", where every search had
previously returned `blocked`. The product searches again.

## What this costs

`PROD-003` and `SEARCH-001`–`SEARCH-007` named Google explicitly and now read
as the first configured engine, with Google as that default. The
Google-specific guarantees are unchanged for Google: the query is passed
through unrewritten, operators still reach the engine, one SERP renders at a
time, and suggestions are returned but never executed.

The real cost is comparability. Pre-render position scoring (`RANK-003`) was
calibrated against Google SERPs, and another engine's result ordering has a
different distribution. A score stays explainable within one engine but is
**not comparable across engines**, and this ADR does not claim otherwise.
Recalibrating per engine is future work, deliberately not attempted here.

No CAPTCHA is solved, no identity is rotated, and no proxy or search API is
introduced. `SEARCH-012` is unchanged: every engine is best-effort, and
`blocked` stays distinct from an absence of results. ADR-0001's rejection of
Brave, Exa, and SerpAPI still holds — those are credentialed search services,
whereas these are public front ends read through the same renderer.

## Consequences

- Discovery exhausts the configured engines before reporting `blocked`, naming
  the engine that refused last.
- An engine is a URL builder plus a redirect wrapper. Candidate admission,
  advertisement rejection, public-URL assessment, source typing, and
  blocked-marker detection are one shared implementation, so a fallback engine
  is not a weaker security boundary than the first one.
- Engines are awaited one at a time, so `SEARCH-004`'s single-SERP rule holds
  without new machinery.
- Bing encodes its destination as base64url behind an `a1` marker rather than
  passing it through; a wrapper decoding to a relative path is one of its own
  surfaces, not a result.
- A future engine is a parser and a configuration entry, not a change to the
  investigation flow. An engine named in configuration before its parser lands
  is skipped with a diagnostic, while a chain with no usable engine at all is
  refused.

