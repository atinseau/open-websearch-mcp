# ADR-0009: Delegate renderer network enforcement to pinned Obscura

## Context

`Bun.WebView` follows navigations internally and does not expose a pre-connect
interception hook. The MCP still rejects non-public initial and final URLs with
its `PublicUrlPolicy`, but that check cannot alone prove DNS-at-connect or
per-redirect enforcement.

## Decision

Production delegates connection-target validation, DNS rebinding protection,
and redirect-pivot blocking at the renderer boundary to Obscura `0.2.1`.
`tests/rendering/webview-obscura.test.ts` starts that exact binary without
`--allow-private-network` and verifies direct loopback, a public-looking
loopback-resolving hostname, and a redirect-to-private fixture all fail while
the controlled fixture records zero requests.

The MCP retains `PublicUrlPolicy` before navigation and after the resolved URL
as defense in depth. It does not claim that policy replaces the renderer's
network-layer control.

## Consequences

This delegation is version-dependent. Any Obscura pin change must rerun the
adversarial integration test successfully before the new pin is accepted.
If that test cannot run or fails, SECURITY-004/006 are unverified and the
release cannot claim public-network enforcement.
