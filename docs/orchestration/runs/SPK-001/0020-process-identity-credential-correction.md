# Step 0020 - SPK-001 process identity and credential correction

- Timestamp: `2026-08-28T11:25:51Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: repair PID-reuse safety, credential coverage, and monitor fail-closed findings from the post-0019 Standards review
- Completed work: changed tracked descendants from bare PIDs to PID-plus-process-start identities captured in one localized `ps` snapshot; verified that identity immediately before every tracked, scoped, or process-group kill; rejected unknown members rather than killing a potentially recycled group; terminated the owned Bun subprocess immediately when monitoring fails; limited global process snapshots to subprocess-enabled commands while exceptional default-command termination discovers and kills the process-group child safely; added generic `sk-*`, `sk-proj-*`, and JWT credential redaction regressions; and removed the duplicate initial capture-existence predicate
- Files changed: `benchmarks/teachers/process-controls.ts`, `benchmarks/teachers/contract-json.ts`, `benchmarks/teachers/sanitization.test.ts`, `benchmarks/teachers/capture-probe.ts`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: focused process, lifecycle, sanitization, and corpus tests passed; the teacher suite passed three consecutive runs with `31` tests / `158` assertions in approximately `2.34` seconds each; `bun run check` passed with `66` tests / `282` assertions and valid orchestration; audits reproduced 2026-08-27 with `740` artifacts and 2026-08-28 with `307` artifacts; the immutable 2026-08-27 tree comparison remained empty; and package dry-run reported `1,193` files / `36.42 MB`
- Decisions and reasons: process identity is the pair of PID and start time, matching the existing refresh-lock ownership model; normal sandboxed and leaf commands cannot create descendants, so they avoid global scans after successful exit, while an exceptional termination first snapshots the wrapper and command identities before killing them
- Findings or blockers: the preceding Spec review had no findings; the preceding Standards review reported two highs, one medium, and one low. All are repaired. Fresh independent reviews remain required before commit.
- Remaining work: verify final package metrics and run fresh parallel release-gate reviews over the complete delta; if neither reports a blocker/high, commit and integrate through PR and CI
- Exact next action: run package dry-run and independent Standards and Spec reviews against the post-0020 worktree
