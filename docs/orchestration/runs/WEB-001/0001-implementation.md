# WEB-001 — Obscura installer implementation

- Task/attempt: `WEB-001` / `a1`
- Branch/worktree: `agent/web-001-a1` / `.worktree/web-001`
- Base: `93ca0a2`
- Goal: satisfy `INSTALL-001..003` and the installer-owned portions of
  `RENDER-001`, `RENDER-002`, and `SECURITY-009`.

## Completed work

Moved the Obscura installer from configuration to rendering. SPEC-05 owns the
renderer lifecycle; configuration continues to own only the explicit workspace
paths. The installer imports configuration solely through its public index, and
the composition root now wires the rendering public installer seam.

FND-002 had pin validation, an HTTPS seam, a size cap, SHA-256 verification, a
probe, an in-process promise map, atomic rename, and a directory lock. WEB-001
changes the transport to download to a bounded temporary file, streams the file
hash, validates an injected safe archive listing before extraction, requires
`obscura` and `obscura-worker`, rejects traversal/absolute/unexpected entries,
rejects extracted symlinks, makes private directories/files mode `0700`, writes
a per-version manifest, recovers a known interrupted stage, and makes the
cross-process lock cover download through promotion. It selects only after the
smoke probe and leaves old version directories intact for rollback.

The default transport uses HTTPS with redirects forbidden and bounded streamed
writes, then `zipinfo`/`unzip`; tests inject the transport and make no network
requests. The release artifact requires an exact version, `macos-arm64` variant,
HTTPS URL, SHA-256, byte bound, and both expected executable names. No release
alias, quarantine/Gatekeeper operation, fallback renderer, or broad workspace
deletion is introduced.

## Acceptance coverage

`tests/rendering/installer.test.ts` proves fresh install/manifest, in-process
coalescing, corrupt hash rejection, size rejection, traversal rejection, failed
smoke test non-promotion, side-by-side upgrade with rollback retained,
interrupted-stage recovery, and two separate Bun processes coalescing using the
filesystem lock. The existing configuration architecture test now uses the
rendering public interface and continues to cover atomic selection.

## Verification

All completed successfully:

```text
bun run format
bun run lint
bun run lint:limits
bun run lint:types
bun run typecheck
bun test --parallel --isolate        # 154 pass, 0 fail
bun run check                         # valid orchestration state
git diff --check
```

## Files changed

- `src/features/rendering/adapters/installer.ts`
- `src/features/rendering/adapters/obscura-transport.ts`
- `src/features/rendering/index.ts`
- `src/bootstrap/index.ts`
- `src/features/configuration/index.ts`
- `src/features/configuration/adapters/installer.ts` (removed after relocation)
- `tests/rendering/installer.test.ts`
- `tests/architecture/configuration.test.ts`

## Blockers and next action

No blocker. Do not modify `docs/orchestration/state.toml`. Submit this branch
for review/integration; WEB-002 can consume `createObscuraInstaller` and its
types from `@/features/rendering`.
