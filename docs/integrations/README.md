# MCP harness integration

Open WebSearch MCP uses stdio. Find Bun's absolute executable path once:

```sh
which bunx
```

Use that absolute path in persistent configuration. Pin `open-websearch-mcp`
to an exact published version; `@latest` is for a one-off trial only.

## Codex

```toml
[mcp_servers.open_websearch]
command = "/absolute/path/to/bunx"
args = ["--bun", "open-websearch-mcp@0.1.1"]
```

## Claude Code

Add this server entry to Claude Code's MCP configuration:

```json
{
  "mcpServers": {
    "open-websearch": {
      "command": "/absolute/path/to/bunx",
      "args": ["--bun", "open-websearch-mcp@0.1.1"]
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
      "args": ["--bun", "open-websearch-mcp@0.1.1"]
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
      "command": ["/absolute/path/to/bunx", "--bun", "open-websearch-mcp@0.1.1"],
      "enabled": true
    }
  }
}
```

All four harnesses launch the executable themselves. Its public tools are
`web_search` and `web_open`.
