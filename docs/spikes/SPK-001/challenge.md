# SPK-001 challenge record

Date: 2026-08-27

## Challenge

Can the installed Codex and Claude Code CLIs produce observable teacher runs
without project context, user customization, custom tools, or hooks while
retaining their normal authentication and native Web tools?

## Evidence

- Codex runs with a fresh `HOME` and `CODEX_HOME`, copied authentication only,
  ignored user config/rules, strict config, read-only sandboxing, disabled
  non-Web features, and an unchanged empty working directory.
- Claude runs with `--safe-mode --setting-sources ""`, an empty strict MCP
  configuration, only `WebSearch,WebFetch`, disabled slash commands and Chrome,
  no session persistence, and an unchanged empty working directory.
- Claude `/status` reported only `Command line arguments` as a setting source
  and no enterprise-managed source. The documented endpoint file, drop-in,
  macOS managed-preferences domain, and configuration profiles were absent.
- Claude `/hooks` reported three user hooks and stated that settings hooks were
  suspended by safe mode. The accepted stream contained no hook event and init
  reported empty plugins, skills, and MCP servers.
- Safe mode alone was insufficient: the first series exposed enabled plugins in
  init metadata, and the second series inherited the user's French language
  preference. Both complete series and their derived fixtures are retained as
  failures.

The sanitized runtime observation is archived at
`benchmarks/teachers/runs/2026-08-27/probes/claude/managed-policy-evidence.json`.

## Decision

Accept the locally observable restriction using the exact invocation above.
Reject a future Claude probe if `/status` names an enterprise-managed source,
the stream emits any hook event, init lists any plugin, skill, or MCP server, or
the isolated working directory changes. A future managed source requires a new
challenge rather than an isolation claim based only on prompt text.

## Rejected alternatives

- Prompt-only restrictions provide no enforcement evidence.
- `--safe-mode` without excluding setting sources retained local customization.
- `--bare` changes the authentication path and excludes normal OAuth/keychain
  behavior.
- Silently dropping either teacher would violate `TEST-006` and SPEC-01.
