# TOOL-002 — operational corrections found by product audit

Task: `TOOL-002`
Attempt: `arch-bench-a1`
Branch/worktree: `agent/arch-bench-a1` / `.worktree/arch-bench`

## The finding that mattered

An adversarial product audit asked the uncomfortable question: with Google
returning `blocked/captcha` on every live query here, is this actually a useful
search product? The measured answer was no. `web_search` returned an empty
`blocked` envelope every time, and the cache could not help, for two reasons
that compounded each other:

- discovery failure returned before the cache was ever consulted, and
- `web_open` never wrote to the cache, so there was nothing to consult.

A product whose only working tool requires the caller to already know the URL is
not a search product.

## Corrections

1. **Search now falls back to stored evidence.** `SEARCH-011` requires
   abandoning a blocked source and continuing with the remaining candidates; the
   local cache is one of those candidates. When discovery is unavailable the
   search answers from what is stored, and reports the real discovery failure
   only when nothing local matches — never an empty success that would hide it.
   `SEARCH-012` is unchanged: Google remains best-effort and no CAPTCHA is
   bypassed.

2. **Explicitly opened pages are cached.** Evidence the product already paid to
   fetch is retained, which is what gives the fallback something to serve.

3. **`no-store` is no longer persisted.** The directive forbids storing the
   response, not merely reusing it. Expiring the entry still wrote body, text,
   and validators to disk, where they survived a restart. `no-cache` remains
   stored but stale, which is correct.

4. **Robots lookups validate DNS.** The static URL check cannot see where a
   public hostname resolves, so a site could have its own `robots.txt` fetched
   from a private address. The production policy now resolves and validates the
   host first.

5. **Logged strings are redacted.** URLs were sanitized, but a search query is
   caller-supplied text that can carry a credential, and it was written to the
   session log verbatim.

## Evidence

Before: `web_search` → `blocked/captcha`, zero results, no fallback. After, on
a live run against the real CLI:

```text
web_open:   success   passages: 5
web_search: success   results: 1   discovery: local_cache
```

Regression tests were added for the fallback and its honest-failure case, for
`no-store` non-persistence across a restart, and for the robots DNS refusal.

`bun run check`: 242 pass, 1 informational live skip, 0 fail.

## Origin cache directives, now wired

The renderer surfaces the main document's `cache-control`, `etag`,
`last-modified`, `expires`, and `date` headers, and the store passes them to
the cache. Freshness therefore follows the origin's own expiry rather than a
content-class TTL guess, and a `no-store` page is refused before it reaches
disk even though its render succeeded. Covered end to end by a test that opens
a `no-store` page and proves the cache stays empty while a cacheable page
remains searchable.

## Still open

LRU eviction exists in storage and is unit-tested, but no product path calls
it, so the 5 GiB ceiling in `CACHE-006` is not enforced at runtime.
Conditional revalidation is likewise not issued: the validators are now stored,
but no `If-None-Match`/`If-Modified-Since` request is made, so a stale entry is
re-rendered in full rather than revalidated. Both are real remaining work,
recorded here rather than claimed as done.
