# FND-001 implementation

Added `src/bootstrap`, `src/mcp`, `src/features/*`, and `src/shared`.

Every feature has exactly one public `index.ts`; each is declarative and has no
feature behavior. The only shared primitive is `Milliseconds`, used by
configuration and rendering.

Real seams established:

- `InvestigationApplication`: thin MCP boundary to application behavior.
- `CallContextFactory`: one abort controller and frozen configuration snapshot
  per call.
- `NavigationScheduler`: future global fair scheduler, including investigation,
  host, Google SERP, explicit-open, cancellation, and shutdown inputs.
- `Renderer` and `RendererSupervisor`: selected single Bun.WebView renderer
  attached to an explicit Obscura CDP endpoint; no alternate browser discovery
  seam exists.
- `InvestigationRepository`, `DiscoveryService`, `Extractor`, `Ranker`, and
  `PublicUrlPolicy`: interfaces at their concrete upcoming capability seams.

`src/mcp/tools.ts` only creates call contexts, relays cancellation, and
delegates to `InvestigationApplication`. `src/bootstrap/index.ts` is the sole
composition root. No renderer, scheduler, storage, discovery, or extraction
behavior was implemented.

Added architecture fixtures and tests for the native Oxlint numerical rules,
plus a composition/lifecycle test. No custom linter or import-graph checker was
added.
