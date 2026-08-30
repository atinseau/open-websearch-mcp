# Verified Codex compatibility matrix — 2026-08-29

Commit under test: `33ee087` plus the VER-002 test-only fixture changes.

Server command in the Gemini CLI and OpenCode probes:

```text
/Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/arch-bench/src/cli.ts
```

The supported harness in this matrix is Codex only, as required by amended
`PROD-005` and ADR-0012. Its verification criterion is a real stdio
registration, tool discovery, and a completed `web_search` call returning a
portable textual result. The Codex command removed its temporary registration
on completion. No unavailable harness was authenticated, installed, or
otherwise mutated.

| Harness | Version / availability | Status | Evidence |
| --- | --- | --- | --- |
| Codex | `codex-cli 0.150.1` | SUPPORTED — VERIFIED | Real stdio registration, `initialize`, tool discovery, and `web_search` call completed. The raw event output below includes both `content` and `structured_content`. |

## Harnesses outside the verified scope

| Harness | Version / availability | Status | Recorded external reason |
| --- | --- | --- | --- |
| Claude Code | Expected path `/Users/arthur/.local/bin/claude` is absent (`test -x` exit 1). | OUT OF SCOPE | ADR-0006 records that the prior Claude session was revoked and must not be reauthenticated by an agent. It can return to scope only after the CLI is installed and a human authenticates its session. |
| Gemini CLI | `gemini 0.57.0` at `/Users/arthur/.nvm/versions/node/v24.19.0/bin/gemini` | OUT OF SCOPE | Registration succeeds and `--skip-trust` clears the untrusted-folder block, but every headless turn fails on the account's `429 RESOURCE_EXHAUSTED` free-tier quota and chooses built-in `google_web_search` rather than the MCP tool. It can return to scope only with an account that has usable quota. |

These entries are not failed support claims: amended `PROD-005` does not put
them in the verified matrix. The recorded evidence is preserved so a future
probe starts from the actual external constraint.

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

## Recorded Gemini CLI probe

Exact command:

```sh
HOME=/private/tmp/open-websearch-ver002-gemini /Users/arthur/.nvm/versions/node/v24.19.0/bin/gemini mcp add open-websearch-ver002 /Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/arch-bench/src/cli.ts
HOME=/private/tmp/open-websearch-ver002-gemini /Users/arthur/.nvm/versions/node/v24.19.0/bin/gemini mcp list
HOME=/private/tmp/open-websearch-ver002-gemini /Users/arthur/.nvm/versions/node/v24.19.0/bin/gemini --skip-trust --output-format stream-json --prompt 'Use the open-websearch-ver002 MCP server. Call its web_search tool exactly once with query "MCP stdio compatibility". In your final response report the tool name and the returned status only.'
HOME=/private/tmp/open-websearch-ver002-gemini /Users/arthur/.nvm/versions/node/v24.19.0/bin/gemini mcp remove open-websearch-ver002 --scope project
```

Raw stdout/stderr (terminal result):

```text
MCP server "open-websearch-ver002" added to project settings. (stdio)
Warning: MCP servers are configured but disabled because this folder is untrusted.
User-level servers are also suppressed in untrusted folders to prevent accidental side-effects.

Configured MCP servers:

○ open-websearch-ver002: /Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/arch-bench/src/cli.ts (stdio) - Disabled
{"type":"init","timestamp":"2026-08-29T13:58:12.098Z","session_id":"2202b23c-de36-400a-ad87-ac0f723221c2","model":"auto"}
{"type":"message","timestamp":"2026-08-29T13:58:12.100Z","role":"user","content":"Use the open-websearch-ver002 MCP server. Call its web_search tool exactly once with query \"MCP stdio compatibility\". In your final response report the tool name and the returned status only."}
{"type":"tool_use","timestamp":"2026-08-29T13:58:24.336Z","tool_name":"google_web_search","tool_id":"google_web_search__call_740948","parameters":{"query":"MCP stdio compatibility"}}
Attempt 1 failed with status 429. Retrying with backoff... _ApiError: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. ","status":"RESOURCE_EXHAUSTED"}}
Attempt 2 failed with status 429. Retrying with backoff... _ApiError: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. ","status":"RESOURCE_EXHAUSTED"}}
Server "open-websearch-ver002" not found in project settings.
```

The list is limited evidence that Gemini accepted the stdio registration. It is
not tool discovery, initialization, or a product tool call: the harness
reported the server disabled, then chose `google_web_search` rather than the
registered MCP tool. The failed `remove` command did not remove the generated
worktree-local `.gemini/settings.json`; that file was deleted immediately as
cleanup. The temporary HOME was also removed. No account was authenticated and
no credential was entered.

## Annex A — historical OpenCode independence evidence (not supported)

This annex deliberately sits outside the verified compatibility matrix. It
preserves a genuine, already measured client-independence result: OpenCode
registered the server over stdio, discovered `web_search`, invoked it, and
received the portable result envelope. It is **not** a claim that OpenCode is a
supported harness under `PROD-005`.

OpenCode was `1.18.25` at
`/Users/arthur/.nvm/versions/node/v24.19.0/bin/opencode`. The successful turn
used the keyless `opencode/hy3-free` model; no credential was supplied.

Exact command:

```sh
HOME=/private/tmp/open-websearch-ver002-opencode XDG_CONFIG_HOME=/private/tmp/open-websearch-ver002-opencode/config XDG_DATA_HOME=/private/tmp/open-websearch-ver002-opencode/data /Users/arthur/.nvm/versions/node/v24.19.0/bin/opencode mcp add open-websearch-ver002 -- /Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/arch-bench/src/cli.ts
HOME=/private/tmp/open-websearch-ver002-opencode XDG_CONFIG_HOME=/private/tmp/open-websearch-ver002-opencode/config XDG_DATA_HOME=/private/tmp/open-websearch-ver002-opencode/data /Users/arthur/.nvm/versions/node/v24.19.0/bin/opencode mcp list
HOME=/private/tmp/open-websearch-ver002-opencode XDG_CONFIG_HOME=/private/tmp/open-websearch-ver002-opencode/config XDG_DATA_HOME=/private/tmp/open-websearch-ver002-opencode/data /Users/arthur/.nvm/versions/node/v24.19.0/bin/opencode run --format json 'Use the open-websearch-ver002 MCP server. Call its web_search tool exactly once with query "MCP stdio compatibility". In your final response report the tool name and the returned status only.'
```

Raw stdout/stderr:

```text
◆  MCP server "open-websearch-ver002" added to /private/tmp/open-websearch-ver002-opencode/config/opencode/opencode.jsonc
┌  MCP Servers
│
●  ✓ open-websearch-ver002 connected
│      /Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/arch-bench/src/cli.ts
│
└  1 server(s)
{"type":"error","timestamp":1788012110125,"sessionID":"ses_fb22c880affe6AqVzIJwrPTm8f","error":{"name":"ProviderAuthError","data":{"providerID":"google","message":"Google Generative AI API key is missing. Pass it using the 'apiKey' parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable."}}}
```

The first attempt above stopped at `ProviderAuthError` because the default
provider needed a credential. OpenCode also publishes keyless models, so the
turn was repeated with one; that required no authentication and completed a
real tool call.

```sh
HOME=/private/tmp/octurn XDG_CONFIG_HOME=/private/tmp/octurn/config XDG_DATA_HOME=/private/tmp/octurn/data opencode mcp add ver002turn -- /Users/arthur/.bun/bin/bun /Users/arthur/Documents/Dev/projects/open-websearch-mcp/.worktree/arch-bench/src/cli.ts
HOME=/private/tmp/octurn XDG_CONFIG_HOME=/private/tmp/octurn/config XDG_DATA_HOME=/private/tmp/octurn/data opencode run --model opencode/hy3-free --format json 'Call the ver002turn web_search tool once with query "MCP stdio compatibility". Report the returned status only.'
```

Raw JSON stdout (identifiers are runtime-generated):

```json
{"type":"tool_use","sessionID":"ses_fb2254430ffejVHnXAuZv2UJ56","part":{"type":"tool","tool":"ver002turn_web_search","callID":"chatcmpl-tool-8ca466e00256b78b","state":{"status":"completed","input":{"query":"MCP stdio compatibility"},"output":"[investigation_id=f90057ab-581b-4368-8ca2-493ee105bee8; status=blocked; reason=captcha; confidence=low]","metadata":{"truncated":false}}}}
```

This historical run completed a third-party discovery and stdio invocation of
the tool and received the portable result envelope. `blocked/captcha` is the
expected live-Web outcome under SEARCH-012 and PROD-002, not a harness failure.
It remains annex evidence only and does not establish OpenCode support.

Both temporary HOME/XDG configurations were removed after the probes, and the
`.gemini/` project settings the Gemini registration wrote into the worktree
were deleted.

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
