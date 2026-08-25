# SPEC-05 — Rendering and extraction

## Obscura lifecycle

Obscura macOS ARM64 stealth is the only renderer. A release pins version,
variant, URL, and expected archive constraints. On the first Web request, a
single-flight installer downloads via HTTPS to a bounded temporary file,
verifies size, lists the archive safely, rejects absolute/traversal entries,
computes SHA-256, extracts atomically, preserves `obscura` beside
`obscura-worker`, records a manifest, and smoke-tests the executable.

An MCP release changing the pin installs side-by-side, tests, atomically selects
the new version, and retains the old one for rollback. It never uses `latest`,
removes quarantine, disables Gatekeeper, or promotes an incomplete download.

One supervised `obscura serve` listens on loopback. The selected adapter from
SPEC-01 creates/closes isolated destination targets. Defaults: navigation 15 s,
settle 3 s, overall search 30 s. Shutdown is bounded and leaves no child,
target, profile lock, or temporary file.

## Download contract

Each target has a 25 MiB aggregate network-transfer budget across its main
document and subresources. CDP encoded-byte events account for rendered pages;
direct document downloads are streamed to a temporary file while counting and
hashing. Reject a declared body or aggregate above the limit and abort the
target when observed bytes cross it even if headers are missing or false.
Valid persisted documents are renamed atomically under their content hash.
Large documents are never buffered wholly in memory.

## Extractor registry

V1 production extractors cover rendered HTML, plain text, Markdown, JSON, XML,
GitHub/public raw code, and preserved code blocks. A textual PDF extractor is
enabled only after its Bun spike; scanned PDFs return
`unsupported_or_ocr_required`. Images/audio/video return bounded metadata and
are not OCR'd, transcribed, or automatically downloaded.

Obscura native rendered Markdown is the initial HTML extractor. Additional
libraries are admitted only by SPEC-01's teacher comparison. The registry
identifies MIME using headers plus bounded sniffing, records extractor/version,
and returns an explicit unsupported status.

## Safe evidence representation

The agent receives no active HTML. Remove scripts, styles, forms, iframes,
event handlers, unsafe URLs, and hidden content. Visible text remains
`external_untrusted`; sanitization does not claim to detect natural-language
prompt injection. Page text can never trigger execution, tool calls, or
navigation.

Preserve legitimate fenced code separately with detected language, untrusted
status, and invisible-character warnings. Never execute or semantically obey a
code block.

## Main content and passages

Extraction retains heading hierarchy, paragraphs, lists, tables, and code.
Small neighboring blocks may be grouped; passages are not fixed character
windows. Score passages against the query/focus and return at most two diverse
passages per search result by default, approximately 1,200 characters each.
`web_open` may return more content up to its `max_chars` bound.

Each passage carries a real heading/fragment where available, document page for
paginated formats, and a content-derived hash. HTML line numbers are never
invented.

Return up to 20 ranked content links with anchor/context and up to 10 navigation
links as separate fields in the normal result. Remove ads and tracking. Links are data;
the caller must explicitly choose a URL for `web_open`.

## Acceptance

Owned requirements: `RENDER-001` through `RENDER-011` and `EXTRACT-001`
through `EXTRACT-013`. Acceptance includes JS SPA, GitHub/code, article, docs,
forum, table, malformed HTML, binary limit, PDF, injection, and shutdown
fixtures.
