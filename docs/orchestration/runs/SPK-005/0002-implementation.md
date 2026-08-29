# Step 0002 - SPK-005 implementation and decision

- Timestamp: 2026-08-28 Europe/Paris.
- Attempt: 1.
- Worktree / branch / base SHA / head SHA: `.worktree/spk-005-a1` / `agent/spk-005-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / uncommitted evidence.
- OpenCode model / variant / session: Codex delegated implementation / claude-opus-5 / current session.
- Goal: execute S5 probes and publish reproducible evidence.
- Completed work: added alias, FTS5, optional-dependency, numeric-lint, and maintained boundary-plugin fixtures; ran all reported commands; retained failures and challenge record.
- Files changed: `spikes/compatibility/**`, `docs/spikes/SPK-005/{report,challenge}.md`, and this trace.
- Commands and outcomes: alias runtime/TS7/Bun test/Oxlint positive commands passed; alias cycle failed as intended; FTS5 actual and degraded fixture passed; PDF.js, robots parser, and MCP/Zod isolated Bun probes passed; boundary plugin passed the positive fixture and rejected static/dynamic negatives; OpenCode JSON run returned a session event stream; `bun pm pack --dry-run --ignore-scripts` passed.
- Decisions and reasons: do not adopt candidate dependencies. Do not promote the boundary plugin because Oxlint's JS plugin surface is experimental. Raise the mandatory-rule challenge rather than creating a custom linter.
- Findings or blockers: `ARCH-002` and required boundary/dynamic-import enforcement are blocked pending the external decision in `docs/spikes/SPK-005/challenge.md`; dependency direction and import-count enforcement remain unsupported.
- Remaining work: run all mandated repository quality gates and record exact results.
- Exact next action: run format, lint, type-aware lint, typecheck, isolated parallel tests, and aggregate check.
