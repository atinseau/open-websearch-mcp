# WEB-003 review corrections — 2026-08-29

## Changes

- Removed Obscura's production private-network flag. The only loopback fixture
  switch is explicit, test-named, and rejects outside `bun test`.
- Made the WebView renderer require a public URL policy and reject a private
  initial URL before scheduler/WebView creation; it also assesses the resolved
  final URL after renderer redirects.
- Added a lazy root-owned runtime binding: a release pin is installed before its
  supervisor is started, then the renderer and public policy are supplied to a
  runtime-aware application. Root shutdown closes scheduler and supervisor.
- Streamed gzip/deflate decoding through bounded readers for both public-network
  responses and direct downloads. The direct-download test creates an actual
  gzip payload that expands from a small compressed body to 128 KiB and fails a
  1 KiB decoded limit.
- Bound ZIP decoded member sizes using `unzip -Z -l` before extraction.

## Evidence

- `tests/rendering/webview-obscura.test.ts`: private initial renderer URL is
  rejected before scheduling; the explicit test fixture switch allows only its
  loopback fixture.
- `tests/architecture/production-root.test.ts`: composed root binds renderer
  and policy, and a call through that root observes a loopback refusal.
- `tests/storage/download-cache.test.ts`: real gzip decompression bomb exceeds
  decoded bound.
- All required gates passed: format, lint, lint:limits, lint:types, typecheck,
  `bun test --parallel --isolate`, and `bun run check` (176 tests).

## Remaining review risk

The current Bun.WebView API follows redirects internally and does not expose a
pre-request interception hook in this adapter. The renderer validates the
initial target before navigation and the resolved final target before evidence
is returned, but that is not a structural per-hop connection enforcement.
Likewise, `PublicNetworkClient` still passes validated DNS answers to a
transport interface that can ignore them. A security-owned proxy/connector or a
WebView request-interception adapter is required to close that architectural
gap completely. Retry/block/circuit semantics belong to the concurrent WEB-006
discovery seam and were not duplicated here.
