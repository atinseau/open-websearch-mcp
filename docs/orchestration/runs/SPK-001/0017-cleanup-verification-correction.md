# Step 0017 - SPK-001 cleanup verification correction

- Timestamp: `2026-08-28T10:38:46Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: make process cleanup fail closed and restore reproducibility under Bun's default test timeout
- Completed work: made process-group, scoped-descendant, process-tree, and process-control-file cleanup return explicit failures; added bounded rescans after kills so a child forked during cleanup is caught; preserved the detached scope for teacher and CLI commands; kept trusted leaf system utilities in dedicated process groups without the expensive detached-environment scan; and ensured every cleanup path removes its control file even when another cleanup stage fails
- Files changed: `benchmarks/teachers/process-controls.ts`, `benchmarks/teachers/refresh-lifecycle.ts`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: the teacher suite passed three consecutive runs under the declared command with `28` tests / `148` assertions in approximately `3.2` seconds each; `bun run check` then exited `0` with `63` tests / `272` assertions and valid orchestration; prior current-corpus audit, historical-manifest reproduction, immutable-tree comparison, and package gates remained green
- Decisions and reasons: detached tracking remains mandatory for teacher and arbitrary CLI commands; known leaf utilities (`kill`, `ln`, `ls`, `mkdir`, `mv`, `ps`, `rm`, `install`, and `mktemp`) cannot create a detached subprocess and therefore use process-group containment without a global environment scan; cleanup failures are observable even when the child exit code is zero
- Findings or blockers: the preceding Standards review reported two highs and one medium; its Spec peer reported one high, all rooted in cleanup fail-open behavior and default-timeout flakiness. These findings are repaired. Fresh independent reviews remain required.
- Remaining work: verify final package metrics and run fresh parallel Standards and Spec reviews; if no blocker/high remains, commit and integrate through a reviewed PR
- Exact next action: run package dry-run, immutable checks, and fresh independent reviews against the complete delta
