# Claude Code 2.1.243-2.1.247 policy and event visibility

Research date: 2026-08-27. The initial flag research used `2.1.243`; the accepted
probe and corpus used `2.1.247`. The flag observations came from installed
`--help` output, and the final policy was validated by the archived probe.

## Finding

Claude Code 2.1.243 can run the teacher probe with only native `WebSearch` and
`WebFetch` as useful tools, normal existing authentication, an isolated empty
working directory, structured event output, and no session transcript. The policy
uses `--setting-sources ""` because safe mode alone left the user's language
preference observable in model output. It is fail-closed for ordinary
user/project customization, with two documented limits:

- `--tools "WebSearch,WebFetch"` does not affect MCP tools and cannot remove
  `EndConversation` while another tool remains. Pair it with an MCP deny; treat
  `EndConversation` as the built-in, non-I/O exception. [CLI flags](https://code.claude.com/docs/en/cli-reference#cli-flags)
- `--safe-mode` disables managed plugins, skills, CLAUDE.md, and MCP servers, but
  **managed policy settings and policy hooks still apply**. No cited user flag
  overrides that tier. A machine with a managed hook therefore cannot establish
  the requested absolute no-hook boundary from this invocation alone. It needs
  separate configuration evidence that no managed hook applies, or SPK-001 must
  retain a failed probe and challenge the isolation decision. [Clean configuration](https://code.claude.com/docs/en/debug-your-config#test-against-a-clean-configuration)

## Exact controls

| Requirement                             | Control and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Noninteractive                          | `-p`; installed help says it prints a response and exits.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| No project/CLAUDE.md/custom context     | Launch in a newly created empty temp directory and pass `--safe-mode --setting-sources ""`. Safe mode disables CLAUDE.md, auto memory, skills, plugins, hooks, MCP servers, commands, custom agents, workflows, and related customization; excluding setting sources also removes user/project/local preferences while retaining authentication. [CLI flags](https://code.claude.com/docs/en/cli-reference#cli-flags)                                                              |
| Preserve usable auth                    | Use `--safe-mode`, inherit the normal environment/configuration, and do **not** use `--bare` or a fresh `CLAUDE_CONFIG_DIR`. Safe mode keeps authentication normal; bare mode never reads OAuth or the keychain and requires an API key or `apiKeyHelper`. [Bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode), [authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence)                                |
| No custom MCP                           | `--safe-mode --strict-mcp-config --mcp-config '{"mcpServers":{}}' --disallowedTools "mcp__*"`. `--tools` alone does not restrict MCP. [CLI flags](https://code.claude.com/docs/en/cli-reference#cli-flags)                                                                                                                                                                                                                                                                         |
| No skills/commands/plugins              | `--safe-mode --disable-slash-commands`; the latter disables all skills and commands for the run. [CLI flags](https://code.claude.com/docs/en/cli-reference#cli-flags)                                                                                                                                                                                                                                                                                                              |
| No shell/curl/scripts/filesystem tools  | `--tools "WebSearch,WebFetch"` restricts the built-in inventory. Because `Bash`, `PowerShell`, `Read`, `Write`, `Edit`, agents, and workflows are absent, the model has no shell/script or file route; curl cannot run without a shell tool. `--permission-mode dontAsk` denies anything not explicitly pre-approved. [Tool restriction](https://code.claude.com/docs/en/cli-reference#cli-flags), [permission modes](https://code.claude.com/docs/en/headless#auto-approve-tools) |
| Allow native Web tools without a prompt | `--allowedTools "WebSearch,WebFetch"`; this auto-approves rather than restricts, hence the separate `--tools` allowlist. The exact native names and inputs are `WebSearch {query, allowed_domains?, blocked_domains?}` and `WebFetch {url, prompt}`. [Tool inputs](https://code.claude.com/docs/en/agent-sdk/typescript#tool-input-types)                                                                                                                                          |
| No Chrome                               | `--no-chrome`. [CLI flags](https://code.claude.com/docs/en/cli-reference#cli-flags)                                                                                                                                                                                                                                                                                                                                                                                                |
| Observable JSONL                        | `--output-format stream-json --verbose --include-partial-messages`; partial events include streamed `tool_use` names and `input_json_delta` chunks. `--include-hook-events` is evidence-only and makes hook lifecycle events observable where supported. [Stream responses](https://code.claude.com/docs/en/headless#stream-responses), [stream tool calls](https://code.claude.com/docs/en/agent-sdk/streaming-output#stream-tool-calls)                                          |
| No saved session                        | `--no-session-persistence`; print-mode sessions are not saved and cannot be resumed. [Session storage](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored)                                                                                                                                                                                                                                                                                                      |

`WebSearch` exposes the model-authored top-level `query` and returns titles and
URLs. One call may perform up to eight backend refinements; the docs do not promise
individual events for those internal refinements, so only the top-level query is
claimable as observable. `WebFetch` returns processed, lossy content rather than the
raw page. [WebSearch behavior](https://code.claude.com/docs/en/tools-reference#websearch-tool-behavior),
[WebFetch behavior](https://code.claude.com/docs/en/tools-reference#webfetch-tool-behavior)

Complete `assistant` messages carry the Anthropic `BetaMessage`, including content,
model, usage, and tool-use blocks. `user` messages carrying `tool_result` also carry
the structured `tool_use_result`; documented outputs include
`WebSearchOutput.query/results` and `WebFetchOutput.url/result`. The final `result`
event carries answer text, duration, turns, usage, model usage, and permission
denials. Citation metadata, when produced, remains in assistant content; the probe
must demonstrate non-empty citation data or cited URLs rather than infer citations
from the prompt. [SDK messages](https://code.claude.com/docs/en/agent-sdk/typescript#sdkmessage),
[tool output types](https://code.claude.com/docs/en/agent-sdk/typescript#tool-output-types)

## Candidate probe

This command is a candidate for a later authorized model run; it was **not** run for
this research. It writes the trace outside the empty probe directory.

```bash
set -euo pipefail
repo=/path/to/open-websearch-mcp/.worktree/spk-001-a1
trace="$repo/docs/spikes/SPK-001/claude-policy-probe.jsonl"
probe_dir="$(mktemp -d "${TMPDIR:-/tmp}/spk-001-claude.XXXXXX")"
trap 'rm -rf "$probe_dir"' EXIT
test -z "$(find "$probe_dir" -mindepth 1 -print -quit)"

status=0
(
  cd "$probe_dir"
  claude -p \
    --safe-mode \
    --setting-sources "" \
    --tools "WebSearch,WebFetch" \
    --allowedTools "WebSearch,WebFetch" \
    --disallowedTools "mcp__*" \
    --permission-mode dontAsk \
    --disable-slash-commands \
    --strict-mcp-config \
    --mcp-config '{"mcpServers":{}}' \
    --no-chrome \
    --no-session-persistence \
    --output-format stream-json \
    --verbose \
    --include-partial-messages \
    --include-hook-events \
    --max-turns 6 \
    --max-budget-usd 0.25 \
    'Use native WebSearch to find the official Claude Code CLI reference, use native WebFetch to inspect that official page, then answer with one verified CLI fact and cite its URL. Do not use any other tool.'
) >"$trace" || status=$?

test "$status" -eq 0
test -z "$(find "$probe_dir" -mindepth 1 -print -quit)"
```

Do not add `--bare`, replace the system prompt, pass a model, or point
`CLAUDE_CONFIG_DIR` at the temp directory: those alter authentication or native
system/model behavior rather than merely constraining tools.

## Event evidence gate

Accept the probe only when all checks pass:

1. Exactly one `system/init` reports `claude_code_version: "2.1.243"`, the temp
   `cwd`, expected model, empty `mcp_servers`, `skills`, and `plugins`, and no tool
   outside `WebSearch`, `WebFetch`, and the documented `EndConversation` exception.
   The init schema exposes these fields. [System init](https://code.claude.com/docs/en/agent-sdk/typescript#sdksystemmessage)
2. Every complete `assistant.message.content[].tool_use.name` is `WebSearch` or
   `WebFetch`; at least one of each occurs. Pair each tool-use ID with a subsequent
   `user.message.content[].tool_result.tool_use_id`. Reject any MCP, agent, shell,
   file, skill, workflow, Chrome, or computer-use call.
3. Archive the exact `WebSearch.input.query`, `WebSearchOutput.query` and result
   title/URL pairs, each `WebFetch.input.url/prompt`, and each
   `WebFetchOutput.url/result`. Partial `input_json_delta` events are corroborating
   evidence; complete messages are the canonical values.
4. Require the final assistant content to contain a citation to the fetched official
   URL and archive any non-empty `citations` field. Join cited URLs to WebSearch or
   WebFetch output. If the stream lacks citation evidence, record a visibility
   failure; do not reconstruct it from an uncited assertion.
5. Reject every `hook_started`, `hook_progress`, or `hook_response` event. Because
   some managed hooks, including `SessionEnd`, need not emit a start/response event,
   also archive independent settings-policy evidence that no managed hook applies.
   Event absence alone is insufficient for that managed-policy case. [Hook event visibility](https://code.claude.com/docs/en/cli-reference#cli-flags)
6. Require one successful final `result`, no permission denials, exit status zero,
   and an empty temp directory after exit. Verify separately that no transcript for
   the emitted `session_id` was created; `--no-session-persistence` makes any such
   transcript a policy failure.

The installed `--help` independently lists every flag used above and states that
safe mode preserves auth/model/built-ins/permissions, while bare mode excludes
OAuth/keychain auth. Official documentation is authoritative for event schemas and
the managed-policy and `EndConversation` limitations.
