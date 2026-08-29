# REL-002 — packed artifact smoke test

- Task/attempt: `REL-002` / `0001`
- Branch/worktree: `agent/rel-001-a1` / `.worktree/rel-001`
- Base: `33ee087`
- Requirements: packaging/smoke portions of `RELEASE-002` and `RELEASE-003`

## Proof

`tests/package/packed-artifact.test.ts` packs
`open-websearch-mcp@0.1.1`, checks the tarball inventory, installs the tarball
in a unique `/private/tmp` directory, verifies its exact manifest identity, and
launches that artifact with:

```text
bunx --bun --package file:<absolute packed tarball> open-websearch-mcp
```

The official `@modelcontextprotocol/client` then completes `initialize`,
`tools/list`, and `web_search`. The child receives only the
`OPEN_WEBSEARCH_MCP_RELEASE_FIXTURE=1` release-test switch, so the call is
deterministic and does not install Obscura or depend on Google/CAPTCHA.

Observed test output:

```text
packed-artifact-smoke {"initialize":"ok","tools":["web_open","web_search"],"fixture":"release-fixture"}
(pass) REL-002: packed artifact runs through bunx and completes the MCP contract
```

The test removes both the generated tarball and temporary install directory in
`finally`, including failure paths. No process remains after the SDK client is
closed.
