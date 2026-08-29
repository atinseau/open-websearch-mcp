# VER-002 — MCP compatibility matrix

Implemented the official-SDK compatibility coverage in
`tests/mcp/stdio-contract.test.ts` and published the versioned evidence matrix
at `benchmarks/harnesses/2026-08-29-mcp-compatibility-matrix.md`.

Evidence is honest about local availability: Codex completed a real stdio tool
call; Claude Code, Gemini CLI, and OpenCode are unavailable in this environment.
Claude was not authenticated because ADR-0006 requires human reauthentication.

Focused verification passed:

```text
bun test --parallel --isolate tests/mcp/stdio-contract.test.ts
8 pass, 0 fail
```

Full required gates also passed:

```text
bun run format
bun run lint
bun run lint:limits
bun run lint:types
bun run typecheck
bun test --parallel --isolate
bun run check
```

The final test run reported `221 pass, 0 fail`; orchestration validation
reported `{"status":"valid","schema_version":3,"tasks":33,"current_task":null}`.
No state file was modified and no process was intentionally left running.
