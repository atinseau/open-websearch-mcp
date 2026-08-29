# Step 0019 - SPK-001 atomic and legacy correction

- Timestamp: `2026-08-28T11:11:20Z`
- Attempt: `1`
- Status: continue
- Worktree / branch / base SHA / head SHA: `.worktree/spk-001-a1` / `agent/spk-001-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / `d2c1ce0` plus uncommitted corrections
- OpenCode model / variant / session: `openai/gpt-5.6-sol` / default / `interactive-spk-001-a1`
- Goal: repair the scope high and the two medium findings from the post-0018 release reviews
- Completed work: declared `package.json` and `tsconfig.json` in the SPK-001 write set; changed every canonical draft and verification artifact write to temporary-file plus atomic rename with cleanup; reconstructed sealed legacy fixtures from their archived draft and verdict using the versioned v1 assembler; sourced legacy case identity, question, and locale from sealed fixtures rather than mutable root inputs; and removed duplicated sanitization detectors by using the sanitizer itself as the audit predicate
- Files changed: `benchmarks/teachers/derive-fixture-runners.ts`, `benchmarks/teachers/fixture-contract.ts`, `benchmarks/teachers/contract.ts`, `benchmarks/teachers/audit-cases.ts`, `benchmarks/teachers/contract-json.ts`, `docs/orchestration/state.toml`, and this trace
- Commands and outcomes: focused corpus, fixture-contract, and sanitization tests passed with `9` tests / `79` assertions; the declared teacher gate passed with `31` tests / `155` assertions; `bun run check` passed with `66` tests / `279` assertions and valid orchestration; audits reproduced 2026-08-27 with `740` artifacts and 2026-08-28 with `307` artifacts; the immutable 2026-08-27 tree comparison remained empty; and package dry-run reported `1,192` files / `36.41 MB`
- Decisions and reasons: a sealed corpus must remain reproducible after mutable root inputs evolve, so the legacy path now consumes only sealed fixture/run artifacts and reproduces the exact historical assembly semantics; atomic per-file publication uses `draft.json` and `verification.json` as final phase markers while allowing safe retry after interruption
- Findings or blockers: the preceding Standards review passed the zero blocker/high gate with one atomic-publication medium and one duplication low; the preceding Spec review reported one write-set high and one legacy-reproducibility medium. All four findings are repaired. Fresh independent reviews remain required before commit.
- Remaining work: verify final package metrics and run fresh parallel release-gate reviews over the complete delta; if neither reports a blocker/high, commit and integrate through PR and CI
- Exact next action: run package dry-run and independent Standards and Spec reviews against the post-0019 worktree
