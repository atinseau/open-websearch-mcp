# SPEC-02 — Architecture and runtime

## Stack

- macOS ARM64 v1;
- Bun, exact version, as runtime/package manager/test runner/process and file
  interface;
- TypeScript 7 exact version for static verification;
- official MCP TypeScript SDK and Zod;
- `bun:sqlite`, WAL, and content-addressed files;
- Oxfmt, Oxlint, and type-aware `oxlint-tsgolint` with JSON/JSONC config;
- Obscura stealth as the sole renderer.

Project source uses Bun and Web-standard interfaces. It does not import
`node:*`, execute Node, or invoke npm/npx/Yarn/pnpm. Internal compatibility
imports used by the official MCP SDK are accepted because Bun executes them.

## Deep modules and seams

The repository begins with this shape and deepens only when behavior earns a
module:

```text
src/
├── bootstrap/
├── mcp/
├── features/
│   ├── investigation/
│   ├── discovery/
│   ├── rendering/
│   ├── extraction/
│   ├── ranking/
│   ├── storage/
│   ├── security/
│   └── configuration/
└── shared/
```

Each feature may contain `domain/`, `application/`, and `adapters/` as needed.
It exposes exactly one public `index.ts` containing types/interfaces and no
logic. Another feature imports only `@/features/<name>`, never its internals.
Internal barrel files are not used.

Dependency direction is strict:

```text
domain → no infrastructure
application → its domain + interfaces
adapters → Bun / Obscura / SQLite / Google / filesystem
mcp → application interfaces
bootstrap → composition root
```

An interface is introduced at a real seam, not for hypothetical substitution.
The renderer seam is real only because the WebView spike may select the direct
CDP adapter and tests require controlled adapters. Complexity remains hidden
behind small feature interfaces.

`shared` contains only stable primitives used by multiple features. Generic
`utils.ts`, `helpers.ts`, `common.ts`, and `constants.ts` are invalid designs.

## Runtime composition

Bootstrap resolves the workspace, configuration snapshot, logger, database,
blob store, installer, Obscura supervisor, renderer, global scheduler,
extractors, discovery adapters, ranker, and MCP adapter. Features accept these
dependencies; they do not discover environment state internally.

One MCP process owns exactly its pinned Obscura server/pool in production. Test
adapters may receive a fixture endpoint, but the published runtime neither
discovers nor accepts an alternate browser endpoint.

## Concurrency module

The scheduler is process-global and fair by investigation. Default capacity is
`auto`: start at 8 destination slots. The versioned controller evaluates
windows of 20 completed navigations (or 10 seconds, whichever is later). Two
consecutive healthy windows add 2 slots. A window with error rate above 15%,
timeout rate above 10%, P95 above twice the calibrated warm baseline, or MCP
plus Obscura RSS above 80% of the spike-calibrated safe budget halves capacity
(ceiling, minimum 1). Values between those bands hold capacity. Missing RSS
telemetry prevents growth beyond the last calibrated safe capacity but never
disables latency/error backpressure. Thresholds are versioned under
`[experimental]`; TEST-021 may lower, never raise above 40, the machine maximum.
Per-host capacity is 2 and Google SERP capacity is 1. An explicit `web_open`
receives slight priority without starvation.

Calls, fetches, navigations, and queue entries are cancellable and timed. Each
call owns an `AbortController` and immutable config snapshot. Installation is a
single-flight operation shared by concurrent first calls.

## Static quality constraints

Stable existing Oxlint/TypeScript mechanisms must block invalid dependency
direction, non-public cross-feature imports, direct Node imports, cycles, and
alias/dynamic-import escapes. The tooling target also covers files over 300 lines,
functions over 60 lines, complexity over 10, nesting over 4, more than 5
parameters, and more than 12 import declarations. Generated/fixture/declarative
data may be exempt only from line counts. Warnings and unused disables fail CI.
No custom linter is implemented.

The tooling spike publishes a coverage matrix for every rule, including cycles,
aliases, and dynamic imports. Only stable existing Oxlint capabilities/plugins
may enforce them. Any mandatory boundary/cycle/escape rule failing coverage
blocks release and requires an external spec decision; an agent cannot weaken
it through its own ADR. Other unavailable numeric target rules receive a
reproducible `unsupported` trace and ADR and are not listed as automated gates.
No custom linter is written and no agent may report an unenforced rule as green.

## Acceptance

Owned requirements: `ARCH-001` through `ARCH-010`, `ORCH-001` through
`ORCH-008`. Acceptance requires graph fixtures, concurrency tests, lifecycle
tests, and a composition test proving that tool calls cross feature interfaces
rather than infrastructure internals.
