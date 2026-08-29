# Scope ARCH-007 numeric limits to product source

Status: superseded by its own remedy — the scoping below was temporary and the
debt it recorded is now cleared. See "Debt cleared" at the end.

`ARCH-007` requires lint to block files over 300 lines, functions over 60,
complexity over 10, nesting over 4, more than 5 parameters, and more than 12
import declarations. Enabling those thresholds in `.oxlintrc.jsonc` fails the
build immediately, but not on product code: `scripts/orchestration/controller.ts`
(complexity 112, one 478-line function) and several `benchmarks/teachers`
modules predate the rule and violate it. Both are outside FND-001's write set.

The limits are therefore enforced by a nested `src/.oxlintrc.jsonc` and run as
`bun run lint:limits` inside `bun run check`. A nested config is used rather than
an `-c` override because `tests/architecture` guards `ARCH-008` by asserting no
project script passes an alternate `oxlint` configuration; that guard exists to
stop a weaker config from silently replacing the strict one, and it stays intact.

All six supported rules were verified to reject their negative fixtures, and a
violating file placed under `src` was confirmed to fail the gate and to pass
again once removed. This is a real gate, not a decorative one.

## Consequences

- Product source is held to `ARCH-007` from its first commit, which is the point
  at which the rule is cheapest to satisfy.
- `scripts/` and `benchmarks/` were not compliant when this decision was taken.
  That was recorded debt, not an exemption, and it has since been paid.
- The `>12 import declarations` rule stays unenforced. SPK-005 measured that
  `import/max-dependencies` did not report its negative fixture, so per
  `ARCH-005` it is reported as unsupported rather than claimed as green.

## Debt cleared

`scripts/`, `tests/`, and `benchmarks/` now satisfy every enforced threshold.
The limits moved from the nested `src/.oxlintrc.jsonc` into the root
`.oxlintrc.jsonc`, and `lint:limits` runs over `src scripts tests benchmarks`.
The nested configuration was deleted, so there is no longer a narrower config
that could silently apply.

Compliance was reached by extraction, never by relaxing a threshold or
exempting a path. The two largest offenders were `runControllerStep`
(complexity 112, 402 lines) and `captureProbe` (complexity 34, 385 lines);
both were split along the seams their own control flow already implied —
planning, execution, decoding, assembly, and archival — leaving each named
module responsible for one outcome.

`tests/architecture/fixtures/**` remains excluded. Those files are deliberate
violations that prove the gate rejects what it should; making them compliant
would destroy the evidence that it works.

Two limitations survive and must not be described as green: the
`>12 import declarations` rule is still unsupported by the linter, and
`ARCH-007` line-count exemptions for fixture, generated, and declarative data
remain unchanged. Subject to those, the release gate may now describe
`ARCH-007` as enforced repository-wide.
