# MCP compatibility matrix — 2026-08-29

Commit under test: `33ee087` plus the VER-002 test-only fixture changes.

Server command in the harness probe:

```text
/Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/ver-002/src/cli.ts
```

The server was registered as a stdio MCP server. The Codex command removed that
temporary registration on completion. No unavailable harness was authenticated,
installed, or otherwise mutated.

| Harness | Version / availability | Status | Evidence |
| --- | --- | --- | --- |
| Codex | `codex-cli 0.150.1` | PASS | Real stdio registration, `initialize`, tool discovery, and `web_search` call completed. Raw event output below includes both `content` and `structured_content`. |
| Claude Code | Expected path `/Users/arthur/.local/bin/claude` is absent (`test -x` exit 1). | UNAVAILABLE | ADR-0006 also records that the prior Claude session was revoked and must not be reauthenticated by an agent. Install or restore the CLI and have a human reauthenticate before repeating this probe. |
| Gemini CLI | `gemini` is absent from `PATH` (`command -v` exit 1). | UNAVAILABLE | Install a pinned Gemini CLI and rerun its stdio registration/probe. |
| OpenCode | Expected path `/Users/arthur/.opencode/bin/opencode` is absent (`test -x` exit 1). | UNAVAILABLE | Install/restore the pinned OpenCode CLI at that path (or record its actual path/version), then rerun its stdio registration/probe. |

## Codex probe

Exact command:

```sh
/Users/arthur/.local/bin/codex mcp add open-websearch-ver002 --env HOME=/private/tmp/open-websearch-ver002-codex -- /Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/ver-002/src/cli.ts
/Users/arthur/.local/bin/codex exec --json --ephemeral -C /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/ver-002 'Use the open-websearch-ver002 MCP server. Call its web_search tool exactly once with query "MCP stdio compatibility". In your final response report the tool name and the returned status only.'
/Users/arthur/.local/bin/codex mcp remove open-websearch-ver002
```

Raw JSONL stdout (the UUID is runtime-generated):

```jsonl
{"type":"thread.started","thread_id":"01a04cfd-fe6c-7fb3-9c4e-cfa1a6ee87ef"}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"item_0","type":"mcp_tool_call","server":"open-websearch-ver002","tool":"web_search","arguments":{"query":"MCP stdio compatibility"},"result":null,"error":null,"status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_0","type":"mcp_tool_call","server":"open-websearch-ver002","tool":"web_search","arguments":{"query":"MCP stdio compatibility"},"result":{"content":[{"type":"text","text":"[investigation_id=a364704a-2903-4221-8a51-6d83919ffdf8; status=blocked; reason=captcha; confidence=low]"}],"structured_content":{"investigation_id":"a364704a-2903-4221-8a51-6d83919ffdf8","status":"blocked","reason":"captcha","confidence":"low","results":[]}},"error":null,"status":"completed"}}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Called `mcp__open_websearch_ver002__web_search` with query \"MCP stdio compatibility\" — returned status: **blocked**."}}
{"type":"turn.completed","usage":{"input_tokens":99832,"cached_input_tokens":64548,"cache_write_input_tokens":35278,"output_tokens":526,"reasoning_output_tokens":0}}
```

`blocked/captcha` is an expected live-Web outcome, not a harness failure: the
client completed a real tool call and received the portable result envelope.

## Official SDK conformance

Command:

```sh
bun test --parallel --isolate tests/mcp/stdio-contract.test.ts
```

SDK and runtime versions: `@modelcontextprotocol/client 2.0.0`,
`@modelcontextprotocol/server 2.0.0`, Bun `1.4.0`.

Raw result:

```text
8 pass
0 fail
25 expect() calls
```

The test uses the official SDK against real stdio child processes. It proves:

- negotiation of `2024-11-05` and `2025-06-18`;
- exactly `web_search` and `web_open` in `tools/list`, with no resources or
  prompts advertised;
- a text-only consumer and a structured-only consumer each receive the
  investigation ID and result;
- client cancellation aborts an in-flight request; and
- a faster concurrent call completes before a slower call while each response
  remains correlated with its own request.

### Inbound limit

Command:

```sh
bun -e 'const payload = JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list",params:{padding:"x".repeat(4 * 1024 * 1024)}}) + "\\n"; const child = Bun.spawn(["bun", "tests/mcp/fixture-server.ts"], { cwd: process.cwd(), stdin: new Blob([payload]), stdout: "pipe", stderr: "pipe" }); const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]); console.log(JSON.stringify({ exit, stdout, stderr }));'
```

Raw output:

```json
{"exit":0,"stdout":"","stderr":""}
```

The oversized inbound JSON-RPC line receives no MCP response and the stdio
child closes cleanly, which is the SDK transport behavior for a message beyond
the configured 4 MiB buffer.
