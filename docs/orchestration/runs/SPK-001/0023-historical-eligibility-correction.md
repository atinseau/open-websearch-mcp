# Step 0023 - SPK-001 historical eligibility correction

- Timestamp: `2026-08-28T12:56:01Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: repair the high and medium findings from the fresh post-0022 Standards and Spec reviews without treating historical evidence as current conformity evidence
- Completed work: marked audit output for the pre-hardening 2026-08-27 corpus as `historical` and the current 2026-08-28 corpus as `conforming`; documented that the historical Codex command predates explicit native skill-disable switches and is not `TEST-006` evidence; retained 2026-08-28 as the sole current conforming baseline; removed report claims for failure archives absent from the sealed tree; replaced the obsolete process-group description with direct no-fork/no-signal supervision; updated acceptance metrics; and made the audit reject artifacts under unknown fixture-case directories
- Files changed: `benchmarks/teachers/audit-cases.ts`, `benchmarks/teachers/corpus-artifacts.test.ts`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: the unknown-case audit regression passed; teacher lint and type-aware lint passed; the teacher suite passed three consecutive runs with `38` tests / `181` assertions; `bun run check` passed with `73` tests / `305` assertions and valid orchestration
- Decisions and reasons: `TEST-011` requires retaining historical refreshes, not presenting every retained refresh as currently eligible; machine-readable eligibility prevents a successful integrity audit from being mistaken for proof of current native controls; manifesting sanitized bytes alone is insufficient for an unknown fixture case, so every manifested case directory must belong to the snapshotted 20-case corpus
- Findings or blockers: the post-0022 Standards review reported no blocker/high and two mediums plus one low; the Spec review reported one high, two mediums, and one low. All findings are repaired. Fresh independent Standards and Spec reviews remain required before commit.
- Remaining work: obtain fresh independent reviews over the complete post-0023 worktree; if neither reports a blocker/high, commit and integrate through PR and CI
- Exact next action: launch fresh parallel Standards and Spec reviews against the complete post-0023 delta, including untracked artifacts and the historical/conforming eligibility distinction
