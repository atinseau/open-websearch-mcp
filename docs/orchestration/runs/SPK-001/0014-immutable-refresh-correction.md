# Step 0014 - SPK-001 immutable refresh correction

- Timestamp: `2026-08-28T09:52:29Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: close the ninth review's immutable-refresh, sanitization, prompt-boundary, process-bound, atomic-publication, and temporary-cleanup findings
- Completed work: restored the sealed 2026-08-27 run and fixture trees exactly to `d2c1ce0`; created a separate `major-change` refresh dated 2026-08-28; captured fresh accepted Codex and Claude policy probes and 40 real teacher runs; retained every failed attempt; derived and independently verified 20 new fixtures from escaped `external_untrusted` trace blocks; added fail-closed credential, private-key, AWS-key, and `/etc` sanitization; added bounded process execution with descendant termination; made fixture publication atomic; repaired refresh temporary cleanup and historical-manifest cadence discovery; formatted, preflighted, and atomically sealed the new corpus
- Files changed: `benchmarks/teachers/**`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: the sealed 2026-08-28 audit exited `0` with `20` cases / `40` runs / `20` fixtures / `307` artifacts and `11,460,590` bytes; the teacher suite exited `0` with `25` tests / `140` assertions; `bun run check` exited `0` with `60` tests / `264` assertions and valid orchestration; package dry-run exited `0` with `1,186` files / `36.37 MB` unpacked; `git diff --name-only d2c1ce0 --` over both 2026-08-27 artifact trees produced no output
- Decisions and reasons: selected a real new dated refresh rather than relying on squash integration because `TEST-011` says never overwrite a run; retained the spec-required `external_untrusted` separation instead of destructive natural-language filtering because SPEC-07 explicitly disclaims complete prompt-injection detection; allowed explicit Claude `--search-only` and `$1.50` extended-budget retries only after retaining bounded rejected attempts
- Findings or blockers: the prior independent Standards review reported two highs, one medium, and one low; the prior Spec review reported one blocker, two highs, and three mediums. The mechanical findings are repaired, the immutable 2026-08-27 snapshot is restored, and the report metrics now match the sealed 2026-08-28 corpus. Fresh independent reviews remain required.
- Remaining work: run fresh Standards and Spec reviews on the complete corrected delta; repair any blocker/high finding, then record final review and prepare integration
- Exact next action: run parallel Standards and Spec reviews against `eb30c3a28554740a6512116d0b29521ed610c553`, explicitly checking both dated refreshes and the sealed 2026-08-28 manifest
