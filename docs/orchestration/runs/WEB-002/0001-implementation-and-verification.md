# WEB-002 — Obscura supervisor and selected WebView adapter

- Attempt: `a1`
- Branch: `agent/web-002-a1`
- Worktree: `.worktree/web-002`
- Base: `93ca0a2`
- Status: implementation complete; no commit created.

## Delivered

- Added an Obscura supervisor that starts only the supplied pinned executable
  on a random loopback port with stealth enabled. It accepts only the returned
  loopback browser CDP WebSocket URL and never discovers or attaches Chrome.
- The detached process owns its own process group. Shutdown sends TERM to the
  complete owned group, waits five seconds, then sends KILL only when needed.
- Added the one selected `Bun.WebView` adapter. Each navigation creates and
  closes an ephemeral target, uses the existing process-global scheduler, and
  observes CDP network encoded bytes. Declared over-limit bodies and observed
  aggregate over-limit transfers abort the target.
- Expanded the rendering seam with extracted visible text, baseline Markdown,
  links, and rendering diagnostics.

## Acceptance evidence

`tests/rendering/webview-obscura.test.ts` starts a real local loopback fixture
and real Obscura. It proves JavaScript rendering and links, destination
cookie isolation, explicit loopback CDP use, timeout release, declared and
chunked/no-content-length transfer-budget aborts, endpoint closure, and an
empty owned process group after shutdown.

## Gates

All exited zero:

```text
bun run format
bun run lint
bun run lint:limits
bun run lint:types
bun run typecheck
bun test --parallel --isolate
bun run check
git diff --check
```

The full isolated suite passed: 147 tests, zero failures.

## Blockers

None.
