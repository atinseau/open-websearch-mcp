# Step 0001 - SPK-003 measurement

- Timestamp: `2026-08-28T21:33:00Z`
- Attempt: `1`
- Status: verified
- Worktree / branch / base SHA: `.worktree/spk-003-a1` / `agent/spk-003-a1` / `1ad1127b74ef9d0be3c4c8375d4c0a1404cbc742`
- Goal: measure the Obscura capacity curve required by `TEST-021` and calibrate SPEC-02's deterministic controller.
- Completed work: added the Bun-only local-fixture load harness, ran cold/warm levels 1, 4, 8, 16, 24, 32, and 40 for 254 navigations, retained JSON evidence/controller fixture/report/challenge record, and checked for no tagged process orphan.
- Files changed: `spikes/obscura-load/`, `docs/spikes/SPK-003/`, and this required orchestration trace.
- Commands and outcomes: the exact command and final table are in `docs/spikes/SPK-003/report.md`; the type check and bounded load command exited 0; final `pgrep` matched no harness/Obscura process.
- Decisions and reasons: start/maximum/per-host/SERP normative bounds remain 8/40/2/1. Automatic growth and no-telemetry ceiling use 16 because 24's warm P95 exceeds twice 8's warm P95.
- Findings or blockers: an early local alias revision timed out above one and initial parent-only cleanup left worker children. These are retained in the challenge record; the final run uses `.localhost` and a detached owned process group, with zero orphans.
- Exact next action: run the full repository quality gates and provide the artifact paths and calibration to the controller.
