# Step 0016 - SPK-001 process scope correction

- Timestamp: `2026-08-28T10:28:18Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: close the final Standards review's detached-process and fail-closed evidence findings
- Completed work: hid the process-group control path from target commands; added an opaque inherited process scope and cleanup for descendants that create a detached group; added a detached-child regression; made normalization reject failed processes and incomplete isolation before publication; retained bounded-process failures in both malformed-capture archive formats; made every refresh candidate and lock cleanup fail closed; and corrected the current manifest byte total in the report
- Files changed: `benchmarks/teachers/**`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: process/lifecycle tests exited `0` with `9` tests / `27` assertions; the teacher suite exited `0` with `28` tests / `148` assertions; `bun run check` exited `0` with `63` tests / `272` assertions and valid orchestration; the full 2026-08-28 audit exited `0` with `307` artifacts; the historical 2026-08-27 manifest reproduced `740` artifacts; package dry-run reported `1,189` files / `36.39 MB`; `git diff --name-only d2c1ce0 --` over both 2026-08-27 artifact trees produced no output
- Decisions and reasons: process groups remain the primary containment mechanism, while the inherited opaque scope closes the macOS `detached: true` escape without exposing the mutable group-control path; artifact creation and cleanup reject explicit process failures even when exit status is zero
- Findings or blockers: the preceding Standards review reported one high, three mediums, and one low; its Spec peer reported no findings. All reported findings are repaired. Fresh independent reviews remain required because Standards found a high.
- Remaining work: run package dry-run and fresh parallel Standards and Spec reviews; if no blocker/high remains, commit and integrate through a reviewed PR
- Exact next action: verify the package metrics and run fresh independent reviews against the complete delta
