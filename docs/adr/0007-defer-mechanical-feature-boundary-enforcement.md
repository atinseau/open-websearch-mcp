# Enforce feature boundaries through the source-graph architecture test

Status: accepted (amended)

SPK-005 correctly rejected the Node-dependent experimental plugin path. The
repository subsequently gained `tests/architecture/dependency-graph.test.ts`, a
Bun test that reads every TypeScript source file in `src` and asserts the
architecture directly. Extending that existing structural test is permitted by
the project contract; it is not a custom linter.

The test now resolves both `@/` and relative specifiers before applying the
feature rule. A feature may reach another feature only through exactly
`features/<name>` (its public `index.ts`); a relative traversal into another
feature is therefore rejected as well. Literal `import("…")` references are
included in the graph, and computed dynamic imports are rejected outright so a
string-concatenated internal path cannot escape the check. `no-eval`,
`typescript/no-require-imports`, and TypeScript resolution remain independent
root-lint/typecheck protections.

This is equivalent enforcement for the repository's supported TypeScript module
forms. It deliberately does not attempt to parse arbitrary JavaScript embedded
in strings or third-party generated artifacts; those are outside `src`, and a
computed runtime import in `src` fails the architecture test instead of being
silently unanalysed.

## Considered options

1. **Adopt the pinned plugin anyway.** Gives real enforcement, but
   introduces Node into the lint toolchain, breaking `PROD-005` — trading a
   runtime invariant for an architecture check.
2. **Find another stable tool that runs under Bun.** Preserves every invariant,
   but no such tool is known to exist, and searching blocks the foundations.
3. **Use the existing graph test (chosen).** Keeps enforcement under Bun,
   exercises the real source graph, and avoids a custom lint implementation.

## Consequences

- `ARCH-002` and the source-graph parts of `ARCH-003` are CI-blocking through
  the isolated architecture test.
- The source-graph test must be extended with every new supported import form;
  it must never be weakened to accept a form it cannot resolve.
- The retained SPK-005 plugin matrix remains useful evidence if Oxlint later
  offers a stable Bun-compatible native mechanism, but is no longer required for
  current boundary enforcement.
