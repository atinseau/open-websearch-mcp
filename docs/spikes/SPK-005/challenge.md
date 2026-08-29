# SPK-005 challenged decision — stable feature-boundary enforcement

Date: 2026-08-28

Status: **resolved** — the user selected option 3 on 2026-08-29. Recorded as
[ADR-0007](../../adr/0007-defer-mechanical-feature-boundary-enforcement.md).

## Decision requested

Choose an externally approved, stable enforcement path for `ARCH-002` and the
feature-boundary portion of `ARCH-005` before release. The spike must not add a
custom linter or silently lower the rule.

## Measured facts

- Oxlint `1.80.0` native `import/no-cycle` rejects an alias-resolved literal
  cycle; `no-restricted-imports` already rejects direct Node imports.
- Native rules did not provide a context-sensitive rule which lets one feature
  import another feature's `index.ts` but rejects that same feature's internal
  `domain/` path.
- `eslint-plugin-boundaries@7.2.0`, loaded through Oxlint's `jsPlugins`, passed
  the positive public-interface fixture and rejected both static and literal
  dynamic internal imports. Exact evidence is retained in `report.md`.
- Oxlint `1.80.0 --help` says its TypeScript/JavaScript configuration support is
  experimental and requires Node.js. The maintained plugin path is therefore
  not a stable Oxlint mechanism under the project's Bun-only invariant.

## Inference

The trial proves candidate behavior, not the stability required by `ARCH-005`.
Promoting it to a release gate would violate the specification's explicit
"stable existing" condition.

## Proposed options

1. Accept a specifically version-pinned, reviewed Oxlint JS-plugin integration
   despite its experimental status, with the positive/negative fixture matrix
   retained as a permanent gate.
2. Amend the requirement to name a different stable maintained tool that may run
   under Bun and can enforce the exact public-interface rule, then rerun this
   spike.
3. Defer feature-boundary release acceptance until Oxlint makes the required
   plugin interface stable.

## Resolution

The user selected option 3: defer feature-boundary release acceptance. Option 1
was rejected because Oxlint's JS-plugin path requires Node.js, which `PROD-005`
forbids; adopting it would trade a runtime invariant for an architecture check.
Option 2 was rejected because no stable Bun-compatible alternative is known and
searching would block the foundations.

The rule is deferred, not weakened. `ARCH-002` remains normative and is upheld
by feature structure and explicit review from `FND-001` onward. Dependency
direction and the >12 import-declaration limit are deferred on the same basis.
This fixture matrix is retained so any future candidate mechanism is evaluated
against the same positive and negative cases. See ADR-0007 for the consequences.
