# Step 0009 - SPK-001 fifth review correction

- Timestamp: `2026-08-28T01:08:12Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: close the latest review's stale-lock race, complete Codex derivation isolation, policy audit, raw teacher-output reconstruction, exact URL provenance, and passage-bound findings for `TEST-007` through `TEST-011`
- Completed work: serialized stale recovery with a separate token-owned recovery marker; centralized the complete Codex skill and feature deny controls across capture, derivation, and audit; reconstructed fixture drafts from raw Codex event streams and verifier decisions from raw Claude result envelopes; validated complete Codex and Claude policies during audit; required exact structured run URLs instead of substring matching; enforced the 1,200-character passage bound in runtime validation and both fixture schemas; made capture date explicit and snapshotted it through corpus capture; archived the superseded series under `full-policy-v5`; regenerated and independently reverified all 20 fixtures; and sealed a 1,732-artifact manifest
- Files changed: `benchmarks/teachers/**`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: cwd `.worktree/spk-001-a1`, formatting/typecheck/type-aware lint exited `0`; same cwd, targeted tests exited `0` with `16` tests / `72` assertions; same cwd, fixture derivation completed all `20` cases; same cwd, preflight and manifest writes exited `0` with `20` cases / `40` runs / `20` fixtures / `1,732` artifacts; same cwd, teacher tests exited `0` with `17` tests / `73` assertions; same cwd, `bun run check` exited `0` with `52` tests / `197` assertions and valid orchestration; same cwd, package dry-run exited `0` with `1,862` files / `52.82 MB`
- Decisions and reasons: policy evidence is accepted only when the archived command exactly contains every required native deny control; fixture evidence must be reconstructed from provider model-output envelopes rather than trusting editable intermediate JSON; URL membership is parsed structurally and compared exactly; a separate recovery marker prevents two stale-lock contenders from both claiming writer ownership
- Findings or blockers: all known findings from the latest Standards and Spec reviews are repaired; no implementation blocker is currently known
- Remaining work: run fresh independent Standards and Spec reviews on the complete corrected diff; if zero blocker/high findings remain, record final review and prepare integration
- Exact next action: run parallel Standards and Spec reviews against `eb30c3a28554740a6512116d0b29521ed610c553` using this trace and the sealed manifest as evidence
