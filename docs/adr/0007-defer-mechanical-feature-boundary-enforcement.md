# Defer mechanical feature-boundary enforcement

Status: accepted

`ARCH-002` requires that one feature may import another feature's public
`index.ts` but never its internals. SPK-005 proved no stable mechanism can
enforce this today: Oxlint `1.80.0` has no native context-sensitive rule for it,
and the one candidate that does work, `eslint-plugin-boundaries@7.2.0` via
Oxlint's `jsPlugins`, is reachable only through a config path that
`oxlint --help` states is "experimental and require[s] running via Node.js" —
which `PROD-005` forbids. `ARCH-005` prohibits both weakening the rule and
writing a custom linter, so the spike escalated for an external decision.

We defer mechanical enforcement rather than adopt the plugin. The boundary rules
stay normative and are upheld by structure and review while features are written;
they are not silently downgraded. Dependency direction and the >12 import-
declaration limit are likewise unsupported by any proven stable mechanism and are
deferred on the same basis.

## Considered options

1. **Adopt the pinned plugin anyway.** Gives real enforcement immediately, but
   introduces Node into the lint toolchain, breaking `PROD-005` — trading a
   runtime invariant for an architecture check.
2. **Find another stable tool that runs under Bun.** Preserves every invariant,
   but no such tool is known to exist, and searching blocks the foundations.
3. **Defer (chosen).** Costs mechanical enforcement during foundation work, but
   breaks no invariant and incurs no tooling debt.

## Consequences

- `FND-001` must establish the feature skeleton so boundaries are obvious by
  structure, and its review must check them explicitly. Every later feature task
  inherits that review obligation.
- The violation class this would have caught — a cross-feature internal import —
  is now caught by humans and agents, not by CI. That is a real gap, and the risk
  grows with the number of features.
- `TEST-024` cannot claim boundary enforcement in the release gate. Revisit when
  Oxlint stabilises a Bun-compatible plugin interface, or when a stable native
  rule appears; the SPK-005 fixture matrix is retained so any candidate can be
  re-evaluated against the same positive and negative cases.
