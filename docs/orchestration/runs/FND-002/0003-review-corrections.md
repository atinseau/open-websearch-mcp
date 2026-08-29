# FND-002 review corrections

- Worktree: `.worktree/fnd-frontier`; base `91ca2cc`.
- Added `createProductionRoot`: it resolves the workspace, initializes configuration and SQLite/blob storage, creates a JSONL session logger, owns the Obscura installer, and reloads a frozen configuration snapshot before each MCP tool call.
- MCP runtime failures and malformed application output now produce the required successful structured `internal_error` result; argument validation remains SDK-owned.
- The stdio transport accepts a composed configured inbound limit; canonical code fences are longer than embedded backtick runs.
- Session logging is an allowlisted operational-event schema and strips URL query/fragment data. Adversarial body, credential, renamed-field, and error payloads are covered.
- Installer supports HTTPS/injected transport download, byte limits, SHA-256 verification, inspection seam, probe-before-activation, rollback, and a filesystem release lock. Release pin resolution remains deferred until package release metadata is added by packaging work.
- Storage application no longer imports concrete SQLite/blob adapters; bootstrap performs the concrete composition. The import graph now rejects adapter imports from application modules.
- Deferred by scope: cache retrieval/TTL/LRU/pinning/deduplication and the broad MCP conformance matrix.
