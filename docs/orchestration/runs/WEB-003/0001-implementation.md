# WEB-003 implementation

- Task/attempt: WEB-003 / a1
- Branch/worktree: `agent/web-003-a1` / `.worktree/web-003`
- Base: `93ca0a2`

Implemented the public-network security boundary behind `@/features/security`.
The injected DNS and transport seams validate initial URLs, each DNS answer twice
before a connection, and every redirect target. The policy rejects non-HTTP(S),
credentials, localhost/local names, cloud metadata names, private/reserved IPv4,
IPv6 local/multicast/unspecified, and IPv6-mapped IPv4. Redirect, raw byte,
decompression byte, and timeout limits are bounded. Redirect and canonical URLs
are retained while tracker parameters and fragments are removed.

Robots policy is independent of its parser adapter: automatic search blocks a
disallow, explicit opens record an override, and redirects are rechecked. HTML
sanitization produces text-only untrusted evidence. Privacy helpers redact
diagnostics and reject archive traversal.

Changed files:

- `src/features/security/index.ts`
- `src/features/security/application/public-network.ts`
- `src/features/security/domain/{url-policy,robots,privacy}.ts`
- `tests/security/public-network.test.ts`

Verification: `bun run check` passed (155 tests). This includes format, all
lint gates, typecheck, isolated tests, architecture checks, and orchestration
validation. No real network calls occur in WEB-003 tests.

Known boundary: Brotli content encoding is rejected safely as unsupported
because the checked DOM `CompressionFormat` declarations expose gzip/deflate;
it cannot bypass the raw response bound. A later adapter must honor the passed
validated `addresses` connection targets rather than resolve independently.
