# Open WebSearch MCP

`open-websearch-mcp` is a local-first MCP stdio server for deterministic Web
evidence retrieval. It uses Google front-end discovery and a locally installed
Obscura renderer; it has no search API key and runs no language model.

Target v1 is personal macOS ARM64 with Bun 1.4.0. The first Web tool call may
install the separately pinned Obscura sidecar into the private Workspace; the
sidecar is not bundled in the npm package.

## Try it

```sh
bunx --bun open-websearch-mcp@latest
```

The command starts MCP over standard input/output immediately. Do not start a
daemon or pass a subcommand when configuring a harness.

For persistent configurations, pin the published version exactly:

```text
bunx --bun open-websearch-mcp@0.1.1
```

The unscoped package identity is the intended release candidate. The release
driver must confirm npm ownership and availability before publication; this
repository does not publish from local development.

## MCP harnesses

Integration examples for Codex, Claude Code, Gemini CLI, and OpenCode are in
[docs/integrations/README.md](docs/integrations/README.md). Each uses the
absolute path to `bunx` and an exact package version.

## Package contents

The published tarball contains only the executable wrapper, runtime TypeScript
source (including its source-local lint configuration), package metadata,
`tsconfig.json` for the `@/` import alias, and Apache-2.0 licensing files. It
deliberately excludes tests, benchmarks and teacher fixtures, spikes,
orchestration records, development dependencies, Workspaces, runtime caches,
and downloaded Obscura binaries.

## Development

```sh
bun install --frozen-lockfile
bun run check
```

Start with [the master specification](SPEC.md). Step tracing and recovery are
defined in [ORCHESTRATION.md](ORCHESTRATION.md).
