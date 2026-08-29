# SPK-002 adapter decision record

Status: **not challenged**

## Decision

Select exactly one production adapter: **the Bun.WebView adapter connected to
the explicitly supplied, probe-owned Obscura browser-level CDP WebSocket URL**.

## Basis

The final pinned probe passed every applicable condition in SPEC-01 S2 and
`TEST-020` on Bun 1.4.0 with Obscura 0.2.1 stealth:

- explicit loopback browser-level CDP endpoint;
- no Chrome discovery; an existing user Google Chrome process remained outside
  the probe;
- local JavaScript fixture, public `https://bun.sh/`, evaluation,
  `DOM.getDocument`, text, and links;
- six concurrent destination views and 100 sequential navigations;
- an individual view closed while Obscura remained reachable, then the owned
  Obscura process exited and its CDP endpoint closed;
- packaging condition is currently not applicable because the private package
  contains no runtime path for this spike.

See [report.md](report.md) and the machine-readable
[probe-result.json](probe-result.json).

## Reversal rule

If a repeat under these exact pins fails any applicable criterion, or if a
packed artifact changes this runtime path and its essential repeat fails, this
record becomes challenged and production must use only the minimal direct Bun
WebSocket CDP adapter. It must not ship both paths.
