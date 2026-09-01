# MCP harness configuration examples

Open WebSearch MCP uses stdio. Find Bun's absolute executable path once:

```sh
which bunx
```

Use that absolute path in persistent configuration. Pin `open-websearch-mcp`
to an exact published version; `@latest` is for a one-off trial only.

Codex is the only verified supported harness under `PROD-005` (ADR-0012). The
Claude Code, Gemini CLI, and OpenCode entries below are unverified configuration
examples, not compatibility or support claims.

## Codex

```toml
[mcp_servers.open_websearch]
command = "/absolute/path/to/bunx"
args = ["--bun", "open-websearch-mcp@0.2.1"]
```

## Claude Code

Add this server entry to Claude Code's MCP configuration:

```json
{
  "mcpServers": {
    "open-websearch": {
      "command": "/absolute/path/to/bunx",
      "args": ["--bun", "open-websearch-mcp@0.2.1"]
    }
  }
}
```

## Gemini CLI

Add this server entry to Gemini CLI's MCP configuration:

```json
{
  "mcpServers": {
    "open-websearch": {
      "command": "/absolute/path/to/bunx",
      "args": ["--bun", "open-websearch-mcp@0.2.1"]
    }
  }
}
```

## OpenCode

Add this server entry to OpenCode's MCP configuration:

```json
{
  "mcp": {
    "open-websearch": {
      "type": "local",
      "command": ["/absolute/path/to/bunx", "--bun", "open-websearch-mcp@0.2.1"],
      "enabled": true
    }
  }
}
```

These configurations describe how their respective CLIs launch a local stdio
executable. The public tools are `web_search` and `web_open`; use remains
subject to each harness's own availability and authentication conditions.
