# Codex CLI 0.149.1 policy and event visibility

Research date: 2026-08-27. Local primary evidence: `codex --version` returned
`codex-cli 0.149.1`; `codex exec --help`, `codex --help`, `codex features list`,
and `codex login status` were inspected without starting a model run. The
installed login is ChatGPT-backed and `$CODEX_HOME/auth.json` exists.

## Findings

- `codex exec` provides `--ephemeral`, `--ignore-user-config`, `--ignore-rules`,
  `--skip-git-repo-check`, `--cd`, `--sandbox read-only`, and `--json`.
  `--ephemeral` suppresses rollout persistence; add
  `history.persistence="none"` and delete the temporary home to cover prompt
  history and incidental local state too. `exec` defaults approval policy to
  `never`, but the probe sets it explicitly. [Installed `codex exec --help`;
  official noninteractive guide][1] [tagged CLI/config wiring][7]
- `--ignore-user-config` replaces `$CODEX_HOME/config.toml` with an empty user
  layer and therefore removes user-configured MCP servers, inline hooks,
  plugins, provider overrides, and custom agents. It deliberately retains auth
  lookup through `CODEX_HOME`. `--ignore-rules` independently suppresses user
  and project execpolicy `.rules`. System and administrator-managed policy
  still applies, which is desirable native policy and may reject a requested
  override. [Installed help; tagged loader][8]
- `--ignore-user-config` is **not** sufficient user isolation. Codex separately
  reads `$CODEX_HOME/AGENTS.override.md` or `AGENTS.md`, and skills are discovered
  outside `config.toml`, including under `$HOME/.agents/skills`. Use fresh
  `CODEX_HOME` and `HOME` directories, copy only `auth.json` into the former, use
  a fresh non-repository cwd, set `project_doc_max_bytes=0`, and disable skill
  instructions/bundled skills. This excludes user/project skill roots and
  installed plugin state while preserving the observed login.
  [AGENTS.md discovery][2] [skills locations][3] [tagged global-instruction
  provider][9]
- Native live Web Search is selected with `-c 'web_search="live"'`. The global
  `--search` flag exists, but it is absent from this installed version's
  `codex exec --help`; the config override is therefore the unambiguous exec
  form. Hosted Web Search is separate from command networking and remains
  available when local command networking is off. [Web Search guide][4]
- Shell execution can be prevented natively, not merely observed after the
  fact: `--disable shell_tool` sets `features.shell_tool=false`; in 0.149.1 the
  tool planner then selects `ConfigShellToolType::Disabled` and registers no
  shell or unified-exec tool. Consequently `curl` and local scripts have no
  model-callable execution path. `--sandbox read-only` remains defense in depth.
  Disable apps, plugins, browser/computer use, subagents, hooks, skill
  dependencies, and other hosted capabilities so Web Search is the only useful
  external tool. [Config reference][5] [hooks switch][6] [tagged shell
  selection][10] [tagged planner][13]
- `--json` emits JSONL `thread.*`, `turn.*`, and selected `item.*` events. A Web
  Search completion exposes `item.type="web_search"`, `query`, and an `action`
  (`search`, `open_page`, `find_in_page`, or `other`). Command, file-change,
  MCP, and collaboration calls have distinct item types, so their absence is
  locally checkable. [Noninteractive JSONL guide][1] [tagged event schema][11]
- **Exact observability gap:** 0.149.1 cannot emit the requested complete search
  results/citations/tool ledger through `codex exec --json`. The upstream Web
  Search item has an optional opaque `results` array, but the exec JSONL adapter
  copies only `id`, `query`, and `action`; its public `WebSearchItem` has no
  `results` field. Agent-message events contain only rendered text, so citations
  are observable only when the final text includes URLs, not as structured
  citation annotations. The mapper also silently ignores unsupported thread
  item variants, so JSONL is not a universal tool inventory. This blocks a claim
  that the trace exposes native result payloads or structured citations; it can
  prove search actions, rendered cited URLs, selected supported tool calls, and
  the absence of the explicitly represented forbidden call types. [Tagged
  upstream item][14] [tagged exec adapter][12] [tagged exec schemas][15] [16]

## Candidate probe

This exact command is for the observed file-backed ChatGPT login. It prints only
Codex JSONL to stdout; capture stdout outside the temporary tree. The outer shell
only prepares isolation and verifies the cwd. No shell tool is available to the
model.

```bash
set -euo pipefail
test "$(codex --version)" = "codex-cli 0.149.1"
SOURCE_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
test -f "$SOURCE_CODEX_HOME/auth.json"
PROBE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codex-spk001.XXXXXX")"
trap 'rm -rf "$PROBE_ROOT"' EXIT
PROBE_HOME="$PROBE_ROOT/home"
PROBE_UNIX_HOME="$PROBE_ROOT/unix-home"
PROBE_CWD="$PROBE_ROOT/cwd"
mkdir -m 700 "$PROBE_HOME" "$PROBE_UNIX_HOME" "$PROBE_CWD"
/usr/bin/install -m 600 "$SOURCE_CODEX_HOME/auth.json" "$PROBE_HOME/auth.json"

HOME="$PROBE_UNIX_HOME" CODEX_HOME="$PROBE_HOME" codex exec \
  --cd "$PROBE_CWD" \
  --skip-git-repo-check \
  --ephemeral \
  --ignore-user-config \
  --ignore-rules \
  --strict-config \
  --sandbox read-only \
  --json \
  --color never \
  -c 'approval_policy="never"' \
  -c 'web_search="live"' \
  -c 'history.persistence="none"' \
  -c 'project_root_markers=[]' \
  -c 'project_doc_max_bytes=0' \
  -c 'project_doc_fallback_filenames=[]' \
  -c 'skills.include_instructions=false' \
  -c 'skills.bundled.enabled=false' \
  -c 'agents.enabled=false' \
  -c 'apps._default.enabled=false' \
  -c 'analytics.enabled=false' \
  --disable shell_tool \
  --disable apps \
  --disable plugins \
  --disable remote_plugin \
  --disable hooks \
  --disable multi_agent \
  --disable skill_search \
  --disable skill_mcp_dependency_install \
  --disable browser_use \
  --disable browser_use_external \
  --disable browser_use_full_cdp_access \
  --disable computer_use \
  --disable image_generation \
  --disable view_image \
  --disable tool_suggest \
  --disable goals \
  --disable memories \
  'Use native Web Search to identify the latest stable Bun release. Cite every factual claim with source URLs. Do not use local files or any non-Web tool.'

test -z "$(ls -A "$PROBE_CWD")"
rm -rf "$PROBE_ROOT"
trap - EXIT
test ! -e "$PROBE_ROOT"
```

Validate the captured stream as follows:

1. It starts with `thread.started`, then `turn.started`, and ends with
   `turn.completed` (not `turn.failed`). A thread ID is still emitted for live
   correlation; `--ephemeral` means it is not materialized as a resumable
   rollout.
2. At least one completed `item.type == "web_search"` has a non-empty `query`
   and `action.type == "search"`; `open_page`/`find_in_page` actions, when used,
   expose their URL/pattern.
3. No item has type `command_execution`, `file_change`, `mcp_tool_call`, or
   `collab_tool_call`. Configuration/source evidence, rather than absence alone,
   proves that shell and the other disabled tools were not offered.
4. The final completed `agent_message.text` contains source URLs supporting the
   answer. Record these as rendered citations, not structured citation events.
5. Treat absence of `web_search.results` as the documented 0.149.1 limitation,
   not as proof that no results were returned to the model. Verify the empty cwd
   and removal of `PROBE_ROOT` separately from JSONL.

## Primary sources

[1]: https://developers.openai.com/codex/non-interactive-mode
[2]: https://developers.openai.com/codex/agent-configuration/agents-md
[3]: https://developers.openai.com/codex/build-skills#where-codex-loads-local-skills
[4]: https://developers.openai.com/codex/web-search
[5]: https://developers.openai.com/codex/config-file/config-reference
[6]: https://developers.openai.com/codex/hooks#turn-hooks-off
[7]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/exec/src/cli.rs#L31-L65
[8]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/config/src/loader/mod.rs#L310-L358
[9]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/codex-home/src/instructions/mod.rs#L9-L73
[10]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/tools/src/tool_config.rs#L67-L115
[11]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/exec/src/exec_events.rs#L8-L133
[12]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L297-L311
[13]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/core/src/tools/spec_plan.rs#L962-L1008
[14]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/ext/items/src/web_search.rs#L7-L23
[15]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/exec/src/exec_events.rs#L135-L165
[16]: https://github.com/openai/codex/blob/rust-v0.149.1/codex-rs/exec/src/exec_events.rs#L296-L302
