# Scope ARCH-007 numeric limits to product source

Status: accepted

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
- `scripts/` and `benchmarks/` are not yet compliant. This is recorded debt, not
  an exemption: `ARCH-007` grants exemptions only for line counts on fixture,
  generated, and declarative data. A follow-up task must either bring them into
  compliance or record why they cannot be.
- The `>12 import declarations` rule stays unenforced. SPK-005 measured that
  `import/max-dependencies` did not report its negative fixture, so per
  `ARCH-005` it is reported as unsupported rather than claimed as green.
- The release gate must not describe `ARCH-007` as fully enforced repository-wide
  until that debt is cleared.
