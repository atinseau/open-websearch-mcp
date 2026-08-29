# WEB-006 implementation

- Task/attempt: WEB-006 / 1
- Branch/worktree: `agent/web-006-a1` / `.worktree/web-006`
- Base: `5794e7d`
- Goal: public Google-front-end discovery adapter, conservative SERP parsing, suggestions, bounded candidate attempts, retries, and circuits.

## Completed work

- Added the `GoogleDiscoveryService` public seam and immutable `google-public` profile declaration. Google queries are passed as the caller authored them, with optional locale added separately.
- Added conservative rendered-SERP parsing. It resolves Google redirect links before public URL assessment; excludes ads, Google navigation/tracking URLs, login/authentication resources, non-public URLs, and unlabelled links; labels organic/news/discussion/video/academic/document/other candidates.
- Added capped related/question suggestions; they are data only and the discovery adapter performs exactly one SERP navigation.
- Added explicit `blocked`, `empty`, and `parse_failure` results. CAPTCHA/WAF/consent markers produce blocked; known no-result copy produces empty; unrecognized markup produces `unrecognized_serp_markup` rather than an empty success.
- Added a 30-destination hard ceiling, one retry for network/target failures, one short retry for timeouts, and a per-call host circuit opened after two blocks. A blocked candidate does not stop other hosts.

## Evidence

- Saved fixtures and `tests/discovery/google-discovery.test.ts` cover query/profile routing; organic plus every module type; direct and redirect ads/trackers; suggestions without navigation; CAPTCHA versus empty; the ceiling, retries/circuit, and continuation after blocks; and markup degradation.
- Passed: `bun run format`, `bun run lint`, `bun run lint:limits`, `bun run lint:types`, `bun run typecheck`, `bun test --parallel --isolate` (180 passing), and `bun run check`.

## Decisions and open items

- The renderer exposes rendered text and links rather than raw HTML. The parser intentionally treats selector/markup loss as `parse_failure`; production live canaries can surface that diagnostic without silently returning garbage.
- `google-public` is carried on Google render requests and is separate from destination requests. Persistence location/lifecycle remains owned by renderer composition/configuration, which is not yet composed into the application layer.
- No external Google request was made; acceptance is fixture-based by design. No blocker.
