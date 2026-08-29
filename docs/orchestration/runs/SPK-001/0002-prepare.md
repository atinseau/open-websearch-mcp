# Step 0002 - SPK-001 prepare

- Timestamp: `2026-08-27T12:38:14Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `eb30c3a28554740a6512116d0b29521ed610c553`
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: establish isolated attempt one and reproducible acceptance for the teacher corpus
- Completed work: created the dedicated branch/worktree and bound acceptance to exact corpus/schema tests, direct strict formatting/linting over the task write set, the repository aggregate gate, and package inspection
- Files changed: `docs/orchestration/state.toml` and SPK-001 preparation traces
- Commands and outcomes: from repository root, `git worktree add -b agent/spk-001-a1 .worktree/spk-001-a1 eb30c3a28554740a6512116d0b29521ed610c553` exited 0
- Decisions and reasons: probe policy and event observability before any 20-case spend; preserve failed probes; keep all teacher corpus code/data under `benchmarks/teachers` and decisions under `docs/spikes/SPK-001`
- Findings or blockers: Codex exposes JSONL, ephemeral execution, ignored user config, and a read-only sandbox; Claude exposes bare/safe modes, explicit tools, strict empty MCP config, disabled slash commands, no persistence, and stream JSON. Exact native WebSearch tool names and authentication remain to be proven by probes
- Remaining work: implement the corpus contract and probe harness, then execute one isolated Web-only query with each CLI
- Exact next action: inspect native tool metadata and implement failing contract tests before capture code
