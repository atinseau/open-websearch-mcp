# TOOL-002 product review corrections

The real CLI now composes the production root and serves MCP over stdio. The
official SDK completed initialization, tool listing, and a live `web_search`.
The pinned Obscura `0.2.1` archive installs through the product installer;
Google CAPTCHA is returned as the typed `blocked/captcha` outcome.

Redirect aliases reserve the renderer-resolved canonical URL before emission,
and surplus search preparation receives per-search cancellation.

SECURITY-005 is composed from the production robots policy. SECURITY-004/006
are defense-in-depth: MCP static policy gates URLs and pinned Obscura performs
network-layer DNS/private/redirect enforcement, proven by the real-binary
adversarial fixture test. ADR-0009 records the version-dependent delegation.

Evidence: targeted installer, MCP, investigation, security, and WebView tests;
`bun run check` is the final task gate.
