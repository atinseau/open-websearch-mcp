# FND-001 verification

Commands exited zero:

```text
bun run format
bun run lint
bun run lint:types
bun run typecheck
bun test --parallel --isolate
bun run check
bun pm pack --dry-run --ignore-scripts
git diff --check
```

The architecture suite has positive and negative native Oxlint fixtures for
file length, function length, complexity, nesting depth, and parameter count.
It also retains the SPK-005 Node-import and cycle fixtures and the
public-feature-import / cross-feature-internal review fixture pair.

Mechanically enforced by the current default project configuration: direct Node
imports, literal cycles, strict formatting/type checking, warnings, and unused
disables. Alias-cycle behavior remains proven by the retained SPK-005 fixture
matrix.

Mechanically enforced over product source by `src/.oxlintrc.jsonc`, run as
`bun run lint:limits` inside `bun run check`: file length 300, function length
60, complexity 10, depth 4, and parameters 5. A nested configuration applies
them to `src` without passing an alternate `-c` config, so the `ARCH-008` guard
against configuration substitution stays intact. `tests/architecture` asserts
the thresholds, asserts the script wiring, and proves the gate fails on a
violating file placed under `src`. ADR-0008 records why `scripts/` and
`benchmarks/` are not yet compliant and treats that as debt, not exemption.

Still normative but structure-and-review only under ADR-0007: one-public-index
feature boundaries, cross-feature internal imports (including literal dynamic
imports), dependency direction, and more-than-12 import declarations. No rule
in this paragraph is reported green.

A `max-statements` rule was briefly configured and has been removed: `ARCH-007`
names file lines, function lines, complexity, depth, parameters, and import
declarations, and no agent may add a permanent constraint the specification does
not state. Its fixtures are retained as SPK-005 capability evidence only.
