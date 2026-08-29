# FND-001 step 0004 — review corrections

Two independent reviews ran against the first implementation. Both returned
high findings and no blockers; every finding was reproduced and accepted.

## Corrections

1. **`max-statements` was not normative.** `ARCH-007` names file lines,
   function lines, complexity, depth, parameters, and import declarations. The
   rule had been copied from SPK-005's capability fixtures into the enforced
   config. Removed from `src/.oxlintrc.jsonc` and from the normative threshold
   table; its fixtures remain as SPK-005 capability evidence only.
2. **The verification trace was false.** Step 0003 stated the numeric limits
   were not enabled and that configuration was intentionally unmodified, which
   stopped being true once `src/.oxlintrc.jsonc` and `lint:limits` were added.
   Corrected in place.
3. **The ARCH-007 gate was untested.** `quality-limits.test.ts` only exercised
   throwaway per-rule configs, so it would have passed with the real gate
   deleted. Added tests asserting the configured thresholds, the script wiring,
   and that the gate genuinely fails on a violating file placed under `src`.
4. **`ARCH-001` was tested by file name, not by graph.** Added
   `dependency-graph.test.ts`, which parses the real imports of `src` and
   enforces public-index-only cross-feature access, inward dependency direction,
   the `ARCH-004` shared-primitive rule, and one entrypoint per feature. This is
   the only automated check of the shape ADR-0007 leaves to review.
5. **`ARCH-004` was violated.** The new graph test failed immediately:
   `shared/duration.ts` had exactly one consumer. A primitive used by one
   feature belongs to that feature, so `Milliseconds` moved into
   `features/configuration` and `src/shared/` was removed. `shared` will
   reappear only when a second feature genuinely needs a primitive.
6. **Speculative interface removed.** `SchedulerControllerFixture` was exported
   but unused; SPEC-02 forbids interfaces introduced for hypothetical
   substitution.
7. **Missing acceptance categories.** SPEC-02 requires concurrency and lifecycle
   tests. Added `call-lifecycle.test.ts`: overlapping calls never share a
   context or snapshot, cancelling one call leaves concurrent calls untouched,
   and a settled call stops observing its client signal.
8. **Write set widened.** `package.json` and `docs/adr` were edited outside the
   declared set. The declaration now covers them rather than leaving the breach
   undisclosed.

## Enforcement status, stated plainly

Mechanically enforced: Node imports, literal cycles, formatting, type checking,
warnings, unused disables, and the five `ARCH-007` numeric limits over `src`.
The dependency-graph test additionally enforces public-index access, inward
direction, and the shared-primitive rule for `src`.

Not mechanically enforced, per ADR-0007: alias and dynamic-import escapes from
the boundary rule, and the `>12 import declarations` limit that SPK-005 measured
as unsupported. These remain normative review obligations and are not reported
as green.

Recorded debt, per ADR-0008: `scripts/` and `benchmarks/` do not satisfy
`ARCH-007` and are excluded from the limits gate.

## Verification

`bun run check`: 112 tests, 0 failures. `bun run lint:limits` passes and was
proven to fail on an injected violation.

## Next action

Integrate FND-001, then select the next dependency-complete task. FND-002,
FND-003, and FND-006 all become ready once FND-001 is verified.
