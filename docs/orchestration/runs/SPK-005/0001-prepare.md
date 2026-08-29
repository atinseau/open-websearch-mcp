# Step 0001 - SPK-005 prepare

- Timestamp: 2026-08-28 Europe/Paris.
- Attempt: 1.
- Worktree / branch / base SHA / head SHA: `.worktree/spk-005-a1` / `agent/spk-005-a1` / `eb30c3a28554740a6512116d0b29521ed610c553` / pending inspection.
- OpenCode model / variant / session: Codex delegated implementation / claude-opus-5 / current session.
- Goal: Produce reproducible Bun compatibility evidence for S5, retaining failures and an honest Oxlint coverage decision.
- Completed work: Read AGENTS.md, RTK.md, SPEC.md, CONTEXT.md, SPEC-01 S5, applicable requirements, orchestration protocol/state, existing architecture fixtures/configuration, and the SPK-001 report exemplar.
- Files changed: this trace only.
- Commands and outcomes: read-only inspection completed; existing architecture fixtures cover Node imports, a cross-feature internal alias import, and a type-only import cycle. Existing `.oxlintrc.jsonc` enables `import/no-cycle` and Node import restrictions, but contains no declared feature-boundary/dynamic-import/complexity rules.
- Decisions and reasons: Build all new executable evidence beneath `spikes/compatibility`; leave existing `tests/architecture` intact because SPK-005's declared write set excludes it.
- Findings or blockers: None yet. Need determine installed/candidate dependency compatibility and native Oxlint rule coverage.
- Remaining work: Implement isolated Bun probes and fixtures, execute every probe, retain logs/measurements, write report/challenge as dictated by results, and run quality gates.
- Exact next action: Inspect the installed Bun/Oxlint capabilities, dependency lockfile, and available OpenCode command surface.
