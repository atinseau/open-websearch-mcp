# SPK-002 — Bun.WebView to Obscura

## Decision

**Measured fact:** the final probe passed all applicable SPEC-01 S2 criteria
and `TEST-020` on this macOS ARM64 machine.

**Inference:** Bun.WebView's Chrome backend interoperates with this pinned
Obscura CDP implementation when given Obscura's full browser-level WebSocket
URL.

**Decision:** select one Bun.WebView adapter, with an explicit Obscura URL.
Do not enable discovery, attach to, or close user Chrome. The associated record
is [challenge.md](challenge.md).

## Pins and environment

| Item | Measured value |
| --- | --- |
| Base commit | `eb30c3a28554740a6512116d0b29521ed610c553` |
| Bun | `1.4.0` |
| Obscura | `obscura 0.2.1` at `/Users/arthur/.local/bin/obscura` |
| Obscura invocation | `obscura serve --host 127.0.0.1 --port <random 45000–49999> --stealth --allow-private-network` |
| Host | macOS 26.5.1 (25F80), Darwin 25.5.0, arm64 |
| Fixture | `Bun.serve` on loopback, JavaScript sets `data-rendered=true`, visible text, and three links |
| Public JS page | `https://bun.sh/` |

## Exact probe command and retained artifacts

```sh
bun spikes/webview-obscura/probe.ts docs/spikes/SPK-002/probe-result.json
```

Final command result: exit 0. Its complete machine-readable result is
[probe-result.json](probe-result.json), rather than a prose transcription.
Hashes recorded after that run:

```text
f080f36061a6f72046fe5a273b66b9e0248a0af40a13786be400f0aa799d7076  spikes/webview-obscura/probe.ts
d3d10acc5787224b25d924b5ad7e96c93708deffc6ebea3019b6bc23ed9be9e2  spikes/webview-obscura/fixture.html
fe8f7db94a29b87a7c3d609dd2787e9c7d9712e32e64d631bf2874e976900c8d  docs/spikes/SPK-002/probe-result.json
```

The preliminary probe-program failure is retained in
[initial-run-failure.md](initial-run-failure.md). It was corrected and does not
represent an interoperability failure.

## Per-criterion results

| Criterion | Measured result | Verdict |
| --- | --- | --- |
| 1. Own Obscura and obtain browser CDP URL | `ws://127.0.0.1:46751/devtools/browser` from Obscura `/json/version`; the process PID was 15159 | pass |
| 2. Explicit Bun.WebView connection | Constructed `new Bun.WebView({ backend: { type: "chrome", url: cdpUrl } })`; no discovery code path exists in the probe | pass |
| 3. Render/extract | Fixture JavaScript yielded `data-rendered=true`, expected visible text, 3 links, and `DOM.getDocument.root.nodeName="#document"`; `https://bun.sh/` rendered 20,955 text characters | pass |
| 4. Capacity | 6/6 concurrent views rendered the fixture; 100/100 sequential navigations completed | pass |
| 5. Close and cleanup | A view closed while Obscura `/json/version` remained reachable; after owner shutdown `ownedObscuraExited=true` and `ownedCdpEndpointClosed=true` | pass |
| 6. Packed artifact repeat | Not applicable: `package.json` is private and declares no package entrypoint containing this spike. Re-run is mandatory if packaging later changes this runtime path. | pass (conditional N/A) |
| RENDER-006 | A user Google Chrome process was present during the probe. The probe's only backend URL was the owned Obscura URL; it made 0 Chrome discovery/attachment/close calls. Chrome remained running in the post-probe process listing. | pass |

## Cleanup and process discipline

The probe starts only its own random-port Obscura child with `Bun.spawn`. A
`finally` block closes every view, stops the loopback fixture, sends SIGTERM to
that child (then SIGKILL only after a bounded timeout), awaits exit, and checks
that the former CDP endpoint is unavailable. It never calls `Bun.WebView.closeAll`.

An elevated read-only post-run inspection used:

```sh
pgrep -fl 'obscura|Google Chrome' || true
lsof -nP -iTCP:46751 -sTCP:LISTEN || true
```

It found the pre-existing Google Chrome process tree and no `obscura` process
or listener on the final probe port. The exact dynamic final port and
cleanup booleans are preserved in `probe-result.json`.

## Quality gates

All commands exited 0:

```sh
bun run format
bun run lint
bun run lint:types
bun run typecheck
bun test --parallel --isolate
bun run check
```

The two test invocations reported 35 passing tests and 0 failures. `bun run
check` also validated the existing orchestration state (`status: valid`).

## Scope and unresolved items

No product runtime was added. The probe uses only Bun and Web-standard APIs;
it has no direct Node imports. It does not modify the orchestration state.
There is no blocker or user decision required. The packaging repeat remains a
future conditional obligation, not evidence that the current private package
changes the runtime path.
