# SPEC-04 — Google front-end discovery

## Query handling

The calling agent authors the complete query, including phrases and advanced
operators. Discovery preserves it for Google. Ranking separately normalizes
Unicode/case with `Intl.Segmenter`, preserves quoted phrases, names, code tokens
and identifiers, and removes operator syntax from lexical terms. V1 does not
translate or stem aggressively.

Google uses one anonymous persistent `google-public` profile for consent and
locale continuity. It never imports user cookies or credentials. Destination
contexts remain separate.

## SERP extraction

Render normal public SERPs with Obscura. Convert every public card with an
exploitable destination into a candidate and label it `organic`, `news`,
`discussion`, `video`, `academic`, `document`, or `other`. Exclude ads,
Google-tracking destinations, internal widgets without public URLs, and login
resources. Resolve redirect URLs before SSRF validation/navigation.

Extract at most eight related searches/questions as `suggested_queries`.
Suggestions are evidence for the calling agent and are never auto-executed.

DOM selectors are adapter details backed by saved SERP fixtures and resilient
fallback parsing. A DOM change yields an explicit diagnostic and can trigger a
live canary failure; it never silently returns an empty successful result.

## Progressive candidate budget

For each call:

1. query the local FTS/cache and Google concurrently;
2. parse the first SERP and pre-rank candidates;
3. open the best eight destinations within the global scheduler;
4. return early when enough useful pages exist;
5. otherwise use remaining candidates and only then the next SERP;
6. stop at the requested result count, 30 destination analyses, or the 30 s
   default call timeout.

The 30-page candidate budget is configurable under `[experimental]`. A repeated
call in the same investigation excludes consumed results and continues with
unconsumed cached/candidate/SERP state.

Google's position contributes only to candidate selection and 15% of the final
default score. It never overrides extracted evidence relevance.

## Failure policy

Allow one retry for a network/target failure and one shorter retry for a render
timeout when partial extraction may help. Do not immediately retry HTTP 429,
CAPTCHA, or WAF. Two blocks for one host open its circuit for the call; continue
elsewhere. Google has a small global cooldown and only one concurrent SERP.

No CAPTCHA solving, identity rotation, proxy by default, authentication, or WAF
interaction is implemented. `blocked` is a legitimate best-effort result.

## Acceptance

Owned requirements: `SEARCH-001` through `SEARCH-012`, `RANK-001` through
`RANK-003`, and `RENDER-008`/`RENDER-009`. Acceptance uses recorded SERP
fixtures plus serialized live canaries; external Google instability alone is
not a release failure.

