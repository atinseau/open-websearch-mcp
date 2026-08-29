# Step 0015 - SPK-001 final review correction

- Timestamp: `2026-08-28T10:17:35Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: close the fresh Standards and Spec review findings after the immutable refresh correction
- Completed work: changed bounded external execution to place each command in a dedicated POSIX process group and clean reparented descendants after both failure and success; added regressions for reparented descendants and stdin `EPIPE`; made teacher and fixture policy audits reject an explicit process failure even with exit code zero; restored schema and audit compatibility with the reason-less sealed v1 manifest; made sealed manifests authoritative over refresh sidecars; removed malformed lock candidates; and, with explicit user authorization, corrected the uncommitted 2026-08-28 seal from unsupported `major-change` metadata to the truthful `major-prerelease` trigger
- Files changed: `benchmarks/teachers/**`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: targeted process/lifecycle tests exited `0` with `8` tests / `26` assertions; the historical 2026-08-27 manifest reproduced all `740` entries and the complete sealed 2026-08-28 audit exited `0` with `307` entries; the 306 non-refresh entries in the 2026-08-28 manifest had aggregate SHA-256 `ed0873a71f603c3c43e0c0a26fe490c5a9309a2ce79dab0e45f4f24a4609fa0c` before and after the authorized reseal; `git diff --name-only d2c1ce0 --` over both 2026-08-27 artifact trees produced no output
- Decisions and reasons: POSIX process groups close the reparenting gap that a PPID snapshot cannot; a sealed v1 manifest remains valid under its v1 schema even when later optional metadata is absent; the 2026-08-28 refresh is a pre-release validation, not a model/CLI major change; the one-time metadata correction occurred before commit and is recorded rather than hidden
- Findings or blockers: the fresh Standards review reported one high, two mediums, and one low; the fresh Spec review reported one high and one low. All reported implementation and evidence findings are repaired. Fresh independent reviews remain required because the prior reviews found highs.
- Remaining work: run all acceptance gates and fresh parallel Standards and Spec reviews; if no blocker/high remains, commit and integrate through a reviewed PR
- Exact next action: run the complete teacher suite, repository check, both sealed audits, package dry-run, and immutable-history comparison
