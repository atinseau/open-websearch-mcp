# SPK-005 — tooling and optional dependencies

Date: 2026-08-28. Requirements: `ARCH-005`, `ARCH-006`, `ARCH-009`,
`TEST-022`, `TEST-023`; contextual requirements `ARCH-002`, `ARCH-003`,
`ARCH-004`, `ARCH-007`, `CACHE-002`, and `EXTRACT-002`.

## Environment and reproducibility

Measured fact: macOS ARM64; Bun `1.4.0`; TypeScript `7.0.2`; Oxlint `1.80.0`;
OpenCode `1.18.25`. Candidate packages were installed only in
`/private/tmp/spk-005-packages.UjA4Ah`, using Bun, exact versions:
`eslint-plugin-boundaries@7.2.0`, `pdfjs-dist@6.2.108`,
`robots-txt-parser@2.0.3`, `@modelcontextprotocol/server@2.0.0`, and
`zod@4.5.1`. They were not adopted into the project manifest or lockfile.

All spike source is under `spikes/compatibility/`, uses Bun/Web interfaces, and
contains no `node:*` import. Exact source hashes can be regenerated with:

```sh
shasum -a 256 spikes/compatibility/**/*.ts spikes/compatibility/**/*.json*
```

The sorted per-file SHA-256 manifest has aggregate digest
`0c9a35afb6fdcb147d6db15e352cfebe8739375cc9c514d4e98c2060cf8d6518`, from:

```sh
find spikes/compatibility -type f -print | sort | xargs shasum -a 256 | shasum -a 256
```

## Alias resolution (`ARCH-006`)

Measured fact: one fixture imports `@/consumer.ts`, whose alias maps to its
local `src/*`. These commands exited zero:

```sh
bun spikes/compatibility/alias/run.ts
# {"runtime":"bun","alias":"@/consumer.ts","result":"passed"}
bun x tsc -p spikes/compatibility/alias/tsconfig.json --noEmit
bun test --parallel --isolate spikes/compatibility/alias/alias.test.ts
# 1 pass, 0 fail
bun x oxlint --disable-nested-config --config spikes/compatibility/alias/oxlint.jsonc \
  spikes/compatibility/alias/src/consumer.ts
```

Measured negative fact: the alias-only value-import cycle is rejected by Oxlint:

```text
cycle-a.ts:1:29 error import(no-cycle): Dependency cycle detected
cycle-b.ts:1:29 error import(no-cycle): Dependency cycle detected
```

Inference: Bun runtime, Bun test, TS7, and Oxlint use the same `@/*` mapping
for the tested concrete resolution. Decision: `@/` is admissible.

## Oxlint coverage matrix (`ARCH-005`, `ARCH-007`)

| Rule | Positive fixture | Negative fixture / measured outcome | Status |
| --- | --- | --- | --- |
| Node imports | existing architecture valid source | seven existing `tests/architecture/fixtures/invalid/{node,bare-node}*`; `no-restricted-imports` errors | native supported |
| Literal cycles, including alias | `alias/src/consumer.ts` | `alias/src/cycle-{a,b}.ts`; `import/no-cycle` errors | native supported |
| Feature public interface | `boundaries/.../ranking/valid.ts` exits 0 | static and literal `import()` internal fixtures each error `boundaries(dependencies)` | candidate works, unstable |
| Cross-feature internals | same as above | static internal import errors | candidate works, unstable |
| Dynamic-import escape | same as above | literal dynamic internal import errors | candidate works, unstable |
| Dependency direction | no representative product feature graph exists at this base | no stable configured rule proven | unsupported at this spike |
| File >300 | `complexity/valid.ts` exits 0 | `invalid.ts`: `max-lines` error | native supported |
| Function >60 | `complexity/valid.ts` exits 0 | `invalid.ts`: `max-lines-per-function` error | native supported |
| Complexity >10 | `complexity/valid.ts` exits 0 | `invalid.ts`: `complexity` error | native supported |
| Nesting >4 | `complexity/valid.ts` exits 0 | `invalid.ts`: `max-depth` error | native supported |
| Parameters >5 | `complexity/valid.ts` exits 0 | `invalid.ts`: `max-params` error | native supported |
| Import declarations >12 | no native negative result | `import/max-dependencies` did not report the two-import negative fixture | unsupported |

The concrete complexity negative command reported `max-lines`, `max-statements`,
`complexity`, `max-lines-per-function`, `max-params`, and `max-depth` errors.
`max-statements` is therefore additionally supported. Exemptions were not
trialled because these probe fixtures are not production configuration.

Measured fact: the boundary trial copied only to a temporary Bun project and
ran:

```sh
bun x oxlint --disable-nested-config --config oxlint.jsonc src/features/ranking/valid.ts
# exit 0
bun x oxlint --disable-nested-config --config oxlint.jsonc src/features/ranking/invalid-static.ts
# error boundaries(dependencies)
bun x oxlint --disable-nested-config --config oxlint.jsonc src/features/ranking/invalid-dynamic.ts
# error boundaries(dependencies)
```

Inference: `eslint-plugin-boundaries` can express all three fixture cases.
Decision: it is not promoted: Oxlint's JS-plugin surface is experimental. This
is a mandatory-rule blocker, recorded in [challenge.md](challenge.md).

## Optional dependency probes (`TEST-022`, `TEST-023`)

| Candidate | Command | Raw outcome | Decision |
| --- | --- | --- | --- |
| `bun:sqlite` FTS5 | `bun spikes/compatibility/fts5/probe.ts` | `{"compileOption":{"enabled":1},"capability":{"advancedLocalSearch":"enabled","automaticHomebrewInstall":false}}` | available on this machine |
| FTS5 absence | `bun test --parallel --isolate spikes/compatibility/fts5/probe.test.ts` | 1 pass; returns `degraded`, `sqlite_fts5_unavailable`, and `automaticHomebrewInstall:false` | compatible degraded design |
| `pdfjs-dist@6.2.108` | copy probe to isolated package root, then `bun pdfjs.ts` | `{"candidate":"pdfjs-dist","extracted":"PDF spike probe","pages":1}`; warnings: `Indexing all PDF objects`, missing `standardFontDataUrl` | Bun-compatible; optional only, no adoption |
| `robots-txt-parser@2.0.3` | isolated `bun robots.ts` | `{"candidate":"robots-txt-parser","canCrawlPrivate":false,"canCrawlPublic":true}` | Bun-compatible fixture; optional only |
| official MCP SDK + Zod | isolated `bun mcp-zod.ts` | `{"candidates":["@modelcontextprotocol/server","zod"],"result":"initialized"}` | initializes under Bun; stdio flow remains separately required |
| package execution | `bun pm pack --dry-run --ignore-scripts` | exits 0 and produces `open-websearch-mcp-0.0.0.tgz` | pack works; no executable/bin exists yet, so `bunx --bun <packed package>` cannot be proven at this bootstrap base |
| OpenCode JSON flow | `opencode run --format json --dir . 'Reply with exactly: …'` | JSON `step_start`, `text`, `step_finish`, session `ses_fb5c6e17cffelYJCM1FcQ5Af7E`; exact requested text returned | JSON/session creation works |

Measured fact: `opencode session --help` exposes `list` and `delete`; the
observed `run` command exposes `--session`, `--continue`, and `--fork`. The
one-shot JSON flow did not create or prove a subagent flow. Inference: no
subagent/session semantics should be claimed beyond the recorded CLI surface.

## Retained failures

- The first alias Oxlint configuration used nonexistent `import/no-unresolved`;
  Oxlint rejected the configuration. The final cycle fixture uses the registered
  `import/no-cycle` rule instead.
- The first FTS5 SQL used a temporary-qualified virtual-table name and degraded
  despite compile option `ENABLE_FTS5`; corrected unqualified virtual-table
  creation passed.
- The first PDF attempt passed a string to `Uint8Array.fromBase64`; Bun requires
  `{ alphabet: "base64" }`. Corrected probe extracted the fixture text.
- The first boundary-plugin copy omitted transitive packages; it failed to load
  `@boundaries/elements`. The isolated complete install loaded the plugin and
  yielded the positive/negative matrix above.

## Final decision

Inference: FTS5, PDF.js, the selected robots parser, MCP SDK, and Zod are Bun
compatible on this exact machine. No optional dependency has been adopted.

Decision: accept the alias and optional-package measurements; do not report the
feature-boundary rule as green. `ARCH-002` and the boundary/dynamic-import part
of `ARCH-005` were escalated as a blocker in [challenge.md](challenge.md).

That escalation is **resolved**. On 2026-08-29 the user selected deferral,
recorded as [ADR-0007](../../adr/0007-defer-mechanical-feature-boundary-enforcement.md).
Mechanical feature-boundary enforcement is deferred because the only working
candidate requires Oxlint's Node-dependent experimental config path, which
`PROD-005` forbids. The rule remains normative and is upheld by feature
structure and explicit review from `FND-001` onward; it is not weakened.
The numeric unsupported import-count rule and dependency-direction graph rule
remain explicitly unsupported rather than weakened or hand-implemented, and are
deferred on the same basis. This spike is therefore complete and unblocked.
