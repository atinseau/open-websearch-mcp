# SPK-004 — extraction against teachers

## Decision

**Measured fact:** Obscura `0.2.1` native rendered Markdown completed 17 of 18
normalized teacher claim-source URLs. It preserved observable Markdown
structure, but the current teacher corpus has zero URL-located evidence
passages for all 18 accepted claims.

**Inference:** the corpus is adequate for a bounded reachability, lexical
overlap, structure, size, latency, and renderer-memory baseline. It is not
adequate to decide that one extractor returns better evidence passages or less
noise than another.

**Decision:** retain Obscura native rendered Markdown as the sole initial HTML
extractor. Add no Readability or other candidate. This satisfies the initial
baseline portion of `TEST-013` and the non-adoption constraint in `EXTRACT-007`;
it does **not** close the corpus-calibration risk recorded in ADR-0006.

## Reproduction and environment

Run from this worktree with Bun `1.4.0` and Obscura `0.2.1`:

```sh
bun spikes/extraction/benchmark.ts docs/spikes/SPK-004/measurements.json
```

The harness uses Obscura's own `fetch --dump markdown --stealth` output: the
required first baseline. Its renderer integration follows SPK-002's pinned
Bun/Obscura environment (Bun `1.4.0`, Obscura `0.2.1`, Darwin arm64); SPK-002
already proves the explicit Bun.WebView-to-owned-Obscura lifecycle, not user
Chrome discovery. This baseline intentionally opens one source at a time and
caches raw Markdown at `spikes/extraction/cache/`; reruns reuse successes.

Observed platform: `Darwin arm64`. The harness uses Bun and Web-standard APIs,
with no direct Node import or extraction dependency. Each native CLI renderer is
awaited, sampled for RSS, and terminated if still alive; the post-run command
`pgrep -fl obscura || true` emitted no process.

## Machine-readable evidence

[measurements.json](measurements.json) is the authoritative result. It records
every URL, cache key, exit status, Markdown hash/size, latency, peak child RSS,
and per-claim pattern/concept totals. The raw Markdown is retained under
`spikes/extraction/cache/<sha256(url)>.md`; adjacent JSON retains fetch time,
exit status and stderr on failure. Important output hashes:

```text
307dfa18c21df4d7c7449a9c0de8cbb6fc380c2e3ed99e979369e4c5a123c62e  spikes/extraction/benchmark.ts
988fa0af9d0158b0080698b5c4443be7fa54badf62b60c503bf3473671d306e2  docs/spikes/SPK-004/measurements.json
```

The command output and process inspection were recorded in the SPK-004 task
trace; retained raw page output is preferable to a prose transcription.

## Baseline measurements

| Dimension           | Measured result                                                           | What it establishes                                 |
| ------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| Teacher scope       | 20 fixtures; 18 accepted claims; 18 normalized claim-source URLs          | Small, current Codex-only corpus                    |
| Evidence passages   | `0/18` claims have passages                                               | No source-located passage-recall metric is possible |
| Render reachability | 17/18 pages successful; one NICT Japan page failed after a script timeout | Baseline retrieval rate, not extraction correctness |
| Claim patterns      | 28/76 literal acceptable patterns (36.8%)                                 | A conservative lexical overlap proxy only           |
| Claim concepts      | 69/88 required concepts (78.4%)                                           | Concepts remain discoverable in rendered Markdown   |
| Headings            | 786                                                                       | Headings were represented in output                 |
| Links               | 7,468                                                                     | Links were represented, but output is link-dense    |
| Tables              | 6 detected table blocks                                                   | Some table preservation was observed                |
| Code                | 468 fenced code blocks                                                    | Code preservation was observed                      |
| Markdown size       | 129 B min, 45,336 B median, 198,975 B max                                 | Material output-size variation exists               |
| Latency             | 3,334 ms min, 4,524 ms median, 19,046 ms max                              | Sequential cold-ish render timing on this machine   |
| Child renderer RSS  | 32,944 KiB min, 171,568 KiB median, 735,872 KiB max                       | Per-process observed RSS, not combined system RSS   |

The sole failed URL was `https://www.nic.ad.jp/ja/dom/idn.html`; Obscura logged
an HTTP 403 for Font Awesome followed by a five-second script timeout. This is
a renderer/page failure measurement, not evidence that a competing _extractor_
would improve it.

### Noise, links, structure, and code

Noise has no teacher-labelled desired text in this refresh, so a true precision
or noise ratio is unmeasurable. Link density is nevertheless observable: 7,468
links over the successful Markdown corpus, alongside only 786 headings. This
is a signal to handle navigation/content-link separation in the later extractor
registry, not a demonstrated case for a third-party extractor. Tables and code
are output-presence measures, not correctness measures, because the teacher
fixtures contain no expected table or code-block spans.

## Corpus limitation

SPK-001 and ADR-0006 already identified this risk; the measurement confirms it,
rather than resolving it. Codex `exec --json` did not expose native Web result
payloads, so every current `evidence_passages` array is empty. The 18 accepted
claims are answer-level lexical grounding against observable query, URL, and
final-answer fields; they do not prove that a cited page supports a claim at a
particular span.

Consequently, this spike cannot rigorously rank Markdown against Readability,
or validate evidence-passage extraction, noise removal, table fidelity, or code
fidelity against teacher truth. A valid future comparison needs URL-located
quoted passages (with expected structure/link metadata) captured by a
passage-exposing teacher/tool trace, or a newly approved second-teacher design.
It must then run the native baseline and every local, Bun-compatible, keyless
candidate on exactly that same cached corpus.

## Candidate decision and challenge

No measured extractor-specific gap justifies a candidate: the one page failure
occurred during rendering, while the structural and lexical observations have
no labelled alternative output against which to show a gain. Adding a library
would therefore violate `EXTRACT-007`'s demonstrated-gain rule. The explicit
counterargument and resolution are in [challenge.md](challenge.md).

## Quality checks

The focused harness type check passed before the collection command:

```sh
bun x tsc --ignoreConfig --noEmit --target esnext --module preserve --moduleResolution bundler --types bun-types spikes/extraction/benchmark.ts
```

All required repository gates passed outside the restricted process sandbox:

```sh
bun run format
bun run lint
bun run lint:types
bun run typecheck
bun test --parallel --isolate
bun run check
```

The direct restricted-sandbox test invocation had nine expected failures in
SPK-001 process-control tests because it prohibits `sandbox-exec` from spawning
`/bin/ps`; the same prescribed test command passed 95/95 with the required
process permission, and `bun run check` passed afterward.
