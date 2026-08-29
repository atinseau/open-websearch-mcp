# Step 0002 - ARCH debt enforcement assessment

- Timestamp: `2026-08-29`
- Status: partial; ARCH-002 enforcement strengthened, ARCH-007 repository-wide closure remains open.
- Worktree / branch / base SHA: `.worktree/gap-arch` / `agent/gap-arch-a1` / `1bf4445`.

## Completed work

- Extended `tests/architecture/dependency-graph.test.ts` to resolve both `@/`
  and relative imports before enforcing another feature's public entrypoint.
  This blocks relative-traversal and malformed-alias escapes.
- Included literal `import("…")` paths in the graph and rejected computed
  dynamic imports, which cannot be safely resolved by the structural test.
- Added the missing `>12` static import-declaration assertion for `src`.
  The retained Oxlint `1.80.0` negative fixture was rerun and still did not
  report `import/max-dependencies`; this remains test enforcement, not native
  Oxlint enforcement.
- Updated ADR-0007 to record the current source-graph coverage and its exact
  limits.
- Continued the controller validation split begun for this task: root-state,
  task-shape, and current-task boolean chains now delegate to named predicates
  in `state-schema.ts` and `state-current.ts`. This lowers their individual
  complexity without changing the accepted/rejected state semantics.

## Verification

- `bun test --parallel --isolate tests/architecture/dependency-graph.test.ts`
  — passed: 5 tests.
- `bun test --parallel --isolate scripts/orchestration/controller.test.ts scripts/orchestration/state.test.ts`
  — passed: 29 tests, unchanged test files.
- `bun x oxlint --disable-nested-config --config spikes/compatibility/complexity/oxlint.jsonc spikes/compatibility/complexity/invalid.ts`
  — confirms the existing negative fixture triggers numeric rules but still
  emits no `import/max-dependencies` diagnostic.

## Open work

- A repository-wide numeric probe originally overstated the count by including
  five intentionally-invalid architecture fixtures through a configuration
  bypass. Those fixtures are already correctly excluded by the root
  `ignorePatterns` and must remain negative test data. The corrected inventory
  is **53 violations**, all real code under `scripts/` and
  `benchmarks/teachers`. None are generated/fixture/declarative-data-only
  files; the `.test.ts` files contain executable test logic, so the ARCH-007
  line-count exemption does not apply to them. No new `ignorePatterns`
  exception is justified.
  The largest group is `scripts/orchestration` (controller plus executable test
  suites); the remaining violations are benchmark teacher capture, contract,
  audit, refresh, and test modules.
- The root limits configuration was not promoted: promoting it before those
  behavior-preserving refactors would make the gate fail and would not close
  ARCH-007.
- The required refactor of `scripts/orchestration/controller.ts` and the
  benchmark violations must complete before ADR-0008 can be superseded and the
  limits gate can expand beyond `src`.

## Exact next action

Refactor the controller and remaining benchmark violations below the numeric
thresholds, then enable and run the repository-wide limits gate.
