# SPEC-07 — Security and trust

## Trust model

Google pages, destination pages, metadata, code, PDFs, JSON, links, and teacher
outputs are external untrusted data. They may be evidence but never control
flow. Only MCP arguments, validated configuration, and deterministic program
rules authorize actions.

The product removes active HTML/XSS surfaces but does not claim to detect or
erase every natural-language prompt injection. Every emitted passage and code
block carries `external_untrusted`; text is separated from tool instructions in
both text and structured representations.

## Public-network policy

Allow only HTTP and HTTPS public destinations. For the initial URL, every DNS
answer, every connection target, and every redirect:

- reject loopback, private, reserved, link-local, multicast, unspecified,
  metadata endpoints, local hostnames, non-HTTP schemes, embedded credentials,
  and invalid ports;
- resolve and validate again to prevent DNS rebinding;
- apply redirect count, byte, time, and decompression bounds;
- retain the complete redirect/canonical provenance.

No config exception can authorize private networks in v1.

## Robots and navigation authority

Destinations automatically opened by `web_search` respect `robots.txt` for the
declared product user-agent. An explicit agent-chosen `web_open` may continue
despite robots and records that decision. A maintained parser is adopted only
after its Bun compatibility spike; the policy itself is independently tested.

`web_open` follows only its explicit URL and required HTTP redirects.
`web_search` navigates only Google-discovered/local-cache candidates selected by
its deterministic algorithm. Links extracted from a page are returned as data
and never followed automatically.

## Active-content handling

Output text/Markdown and structured blocks only. Strip scripts, styles, forms,
iframes, event handlers, dangerous schemes, active SVG/HTML, and hidden content.
Code is preserved but never executed. The renderer's page JavaScript executes
inside its isolated destination context only; it receives no tool authority,
filesystem paths, cookies from other contexts, or MCP transport access.

## Privacy and observability

- no user authentication, browser profile import, personal cookies, or private
  resource access;
- no external telemetry;
- no cookies, tokens, secrets, full page bodies, full extracted content, or
  environment dumps in logs, versioned traces, or orchestration artifacts;
- the private content-addressed runtime cache may store bounded sanitized
  extraction text required for reuse, but never active HTML, credentials, or
  browser state;
- teacher traces are sanitized before commit;
- stdout is protocol-only; diagnostics use the private workspace.

## Installer and filesystem safety

Use explicit workspace paths, temporary directories, size limits, safe archive
listing, local hashes, atomic renames, and minimum permissions. Do not disable
Gatekeeper, remove quarantine, delete broad paths, follow untrusted filesystem
links, or execute downloaded page artifacts.

## Acceptance

Owned requirements: `SECURITY-001` through `SECURITY-011`. Required suites cover
IPv4/IPv6/private ranges, DNS rebinding, redirect pivots, decompression/size
bombs, tracking URLs, robots differences, HTML/script/injection fixtures,
archive traversal, log redaction, cookie isolation, and forbidden navigation.
