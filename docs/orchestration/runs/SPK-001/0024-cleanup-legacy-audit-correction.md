# Step 0024 - SPK-001 cleanup and legacy audit correction

- Timestamp: `2026-08-28T13:06:37Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: repair the high and medium findings from the fresh post-0023 Standards review while preserving the Spec-clean result
- Completed work: delayed accepted capture publication until the isolated temporary root and copied Codex authentication are removed and absence is verified; retained failed attempts without allowing them to become accepted runs; added standalone credential detection to the historical string audit; required positive input and output token evidence from the expected Claude verifier model; validated both canonical and failure fixture artifacts against the 20 snapshotted case IDs; and added regressions for standalone credential recognition, empty model usage, and unknown failure-case artifacts
- Files changed: `benchmarks/teachers/capture-probe.ts`, `benchmarks/teachers/contract-json.ts`, `benchmarks/teachers/audit-cases.ts`, `benchmarks/teachers/sanitization.test.ts`, `benchmarks/teachers/fixture-contract.ts`, `benchmarks/teachers/fixture-contract.test.ts`, `benchmarks/teachers/corpus-artifacts.test.ts`, `docs/spikes/SPK-001/report.md`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: focused audit, fixture-contract, and sanitization tests passed with `14` tests / `109` assertions; both corpus audits reproduced `historical` 740-artifact and `conforming` 307-artifact results; teacher TypeScript and type-aware lint passed; the teacher suite passed three consecutive runs with `39` tests / `186` assertions; `bun run check` passed with `74` tests / `310` assertions and valid orchestration
- Decisions and reasons: publication after cleanup is simpler and stronger than trying to recover an accepted run whose credential-bearing temporary root leaked; legacy evidence keeps its historical structural semantics but shares current standalone credential recognition; an expected model name without positive token usage is not invocation evidence; fixture failure archives are evidence for known corpus cases and may not introduce unrelated case identities
- Findings or blockers: the post-0023 Standards review reported two highs and two mediums; all are repaired. The parallel Spec review reported no findings. Fresh independent Standards and Spec reviews remain required before commit.
- Remaining work: obtain fresh independent reviews over the complete post-0024 worktree; if neither reports a blocker/high, commit and integrate through PR and CI
- Exact next action: verify final package metrics, then launch fresh parallel Standards and Spec reviews against the complete post-0024 delta
