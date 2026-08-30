# Release-readiness report — 2026-08-29

## Verdict

**Not releasable.** The local code/package gate and clean-checkout reproduction
pass, but the product definition of done is not satisfied. Do not publish,
create a tag, or create a GitHub Release.

## Evidence that passed

- The required local gate passed: format, lint, limits lint, type-aware lint,
  typecheck, isolated tests, and `bun run check`. The suite reported **232
  passed, 1 informational live-canary skip, 0 failed**.
- `tests/package/packed-artifact.test.ts` passed: the packed `0.1.1` artifact
  launched through Bunx and completed MCP `initialize`, `tools/list`, and the
  fixture-backed `web_search` call.
- A fresh `git clone --no-local .` at
  `4c5344f0cc9eece4339b787d998376a54fdaf11f` installed 27 packages with
  `bun install --frozen-lockfile --ignore-scripts` and repeated the complete
  gate with the same 232 pass / 1 skip / 0 fail result. The temporary clone was
  removed after the run.

## Definition of done

| Condition | Verdict | Evidence |
| --- | --- | --- |
| 1. Atomic requirement traceability | **No** | `docs/orchestration/traceability.md` now lists all 160 IDs, but it records explicit uncovered/blocking requirements below. |
| 2. All release gates pass | **No** | Deterministic local gates pass (`bun run check` on `646b8ba`: 280 pass, 1 informational live skip, 0 fail), and `ARCH-002`/`ARCH-007` are enforced repository-wide. The teacher thresholds are now calculable under ADR-0013 but still unmet: the sample is too small to gate on, and every live search is refused by a Google captcha. PROD-005's Codex-only verified matrix is satisfied under ADR-0012. |
| 3. Pinned WebView/Obscura probe | **Yes, version-dependent** | `tests/rendering/webview-obscura.test.ts` passed against Obscura 0.2.1. ADR-0009 requires rerunning it for any pin change. |
| 4. Teacher benchmark thresholds | **No, for a new reason** | ADR-0010 is superseded by ADR-0013: the `2026-08-30` corpus carries captured passages for 8 of 18 accepted claims, so the benchmark is measurable. It still yields no quality score, because all 20 searches were refused by a Google captcha and are reported `blocked` rather than badly answered. The score is published and never gates a release. |
| 5. No critical/high operational finding | **No** | Unresolved release-critical evidence gaps remain; this cannot be certified as clean. |
| 6. Exact packed Bunx smoke | **Yes** | `tests/package/packed-artifact.test.ts` passed. |
| 7. Traceability, docs, clean checkout | **No** | Clean checkout passes, but traceability has blockers and docs contain pre-publication commands presented as immediately usable. |
| 8. Final immutable release trace | **No** | No release commit, signed authorization, or immutable CI artifact exists, and nothing has been published. REL-004's authorization parser, idempotent publish ledger and resume driver now exist and are gated, including the RELEASE-006 simulation of an npm success followed by a GitHub failure resuming without republication. |

## Remaining blockers

1. **Partly cleared.** The immutable `2026-08-30` teacher corpus now carries
   URL-located evidence passages for 8 of 18 accepted claims, captured over
   raw HTTP outside the product (ADR-0013), so TEST-015–017 are calculable.
   Two obstacles remain and are not claimed as green: the sample is too small
   to gate on, and a live quality measurement is currently blocked by a Google
   captcha on every discovery request.
3. ~~Restore full ARCH-002/ARCH-007 enforcement.~~ **Cleared.** `ARCH-002` and
   the source-graph parts of `ARCH-003` are CI-blocking through
   `tests/architecture/dependency-graph.test.ts` (ADR-0007, amended).
   `ARCH-007` numeric limits now live in the root `.oxlintrc.jsonc` and
   `lint:limits` runs over `src scripts tests benchmarks`; the nested
   `src/.oxlintrc.jsonc` was deleted so no narrower configuration can apply
   (ADR-0008, debt cleared). Compliance was reached by extraction, never by
   relaxing a threshold. Two limitations remain and are not claimed as green:
   `import/max-dependencies` is unsupported by the linter (SPK-005), and
   `ARCH-007` line-count exemptions for fixture, generated, and declarative
   data are unchanged.
4. **Cleared as specified.** `TEST-018` requires the reference corpus to declare
   three sources and their isolation, which
   `docs/verification/TEST-018-sources.md` does. The canary corpus holds 32
   public queries, inside the required 30–50 band
   (`tests/live/google-canary-corpus.ts`), and the vendored BEIR SciFact qrels
   subset carries its archive SHA-256, licence, and provenance, measuring
   MRR@10 0.5152 offline. A live run stops after the first CAPTCHA and records
   `corpusSize: 32`; that early stop is prescribed by `TEST-025` and
   `SEARCH-012`, so a partial live sweep is the specified behaviour rather
   than missing evidence. Its results stay informational and cannot gate a
   release.
5. Complete REL-004 only after explicit human release authorization: exact
   commit/version/package/dist-tag/identity, idempotent ledger, npm publish,
   tag, and GitHub Release. REL-003 deliberately does none of these.
6. Google discovery is currently captcha-blocked from this network, so no live
   quality measurement is obtainable here. This was confirmed rather than
   assumed: opening the SERP URL directly returns Google's "unusual traffic"
   interstitial naming the requesting IP address, and the parser classifies it
   correctly as `captcha`. The renderer, extractor, and `web_open` path all
   work on the same pages. This is an environment limit on the discovery
   surface, not a product defect, and it is not claimed as resolved.

## Documentation audit

- README and integration instructions correctly describe stdio, two public
  tools, exact persistent pins, Bun, and the separately pinned Obscura sidecar.
- They overclaim present availability: `bunx --bun open-websearch-mcp@latest`
  and the `0.1.1` exact package commands are written as usable now, although no
  npm publication exists. Treat them as post-publication instructions until
  REL-004 completes.
- ADR-0006, ADR-0007, ADR-0008, ADR-0009, ADR-0013 (superseding ADR-0010), and ADR-0012 accurately
  describe the current limitations. In particular, ADR-0012 narrows PROD-005
  to the measured Codex harness; it does not claim broad harness support. The
  new changelog also states that `0.1.1` is an
  unreleased candidate.

## REL-003 decision

`.github/workflows/release.yml` is a manual, main-only release-candidate gate.
It verifies SemVer/exact pins, runs the full deterministic gate, grades the
benchmark, packs and inspects the tarball, smoke-tests it through Bunx, and
uploads the digest, notes, tarball, and logs. It contains no publication,
tagging, or GitHub Release operation; those require the human authorization and
external idempotency process specified for REL-004.
