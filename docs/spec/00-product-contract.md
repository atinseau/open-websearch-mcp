# SPEC-00 — Product contract

## Objective

Give a local agent compact, attributable evidence from the public Web with the
same practical role as provider WebSearch, while keeping discovery orchestration
in the calling agent and all rendering/ranking state on the user's Mac.

## Owned requirements

This spec owns `PROD-001` through `PROD-006` in
[the requirement registry](requirements.md). It also constrains every public
interface in SPEC-03.

## User-visible contract

- The MCP starts automatically as a `stdio` child of a compatible harness.
- The first Web call may take longer while the pinned Obscura stealth binary is
  installed and smoke-tested. Without a healthy Obscura, the call fails
  explicitly; another renderer is never substituted.
- The caller supplies the investigation query and decides whether to search
  again, open a returned link, or stop. The MCP does not generate an answer.
- Search covers every language and every public source type that yields
  extractable content. Unsupported or blocked content remains visible as a
  structured status rather than disappearing.
- Results are evidence passages with source location, trust, score, links, and
  provenance. They are not assertions of truth.
- The same consumed page is never emitted twice inside one investigation. A new
  investigation may reuse globally cached content.

## Operating boundary

The product may navigate Google's public user interface and public destination
pages. It may store consent/locale state in its own anonymous Google profile. It
does not read a user's browser, cookies, authenticated sessions, keychain, or
private content.

Stealth reduces basic fingerprint mismatches; it is not a promise to defeat
CAPTCHA, WAF, rate limits, paywalls, or authentication. A blocked source causes
best-effort continuation to other candidates.

## Required scenarios

1. A fresh caller submits an advanced Google query, receives five useful pages
   and an investigation ID, then repeats the call and receives new pages.
2. Two investigations request similar evidence: content cache is reused but
   their consumed-page sets remain isolated.
3. An agent explicitly opens a JS-rendered URL and receives focused passages,
   source locations, and links without any second-hop navigation.
4. Google or several destinations block access: usable evidence is returned as
   `partial`; a total block is returned as `blocked` with reasons.
5. A weak search returns the best extractable evidence with low confidence
   rather than manufacturing certainty.
6. Obscura is unavailable: the call returns `renderer_unavailable` and performs
   no curl-style fallback.

## Acceptance

SPEC-00 is accepted when the scenarios above have end-to-end tests through the
MCP surface and every owned requirement has traceability to a test or release
artifact. Passing unit tests alone is insufficient.

