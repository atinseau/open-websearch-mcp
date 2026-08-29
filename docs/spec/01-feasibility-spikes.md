# SPEC-01 — Evidence-first feasibility spikes

## Objective

Resolve uncertain integrations with disposable, versioned experiments before
their conclusions become production architecture. A spike produces a report,
raw evidence, a challenged decision, and a reproducible command. Its prototype
code is not promoted by default.

## Dependencies

Repository bootstrap and PR CI only. These spikes form the first parallel
frontier after bootstrap.

## Spike S1 — Teacher reference capture

Run the 20 research cases with `codex exec --json` in isolated temporary
directories. Before the corpus, probe and archive the CLI's actual tool-policy
flags and event visibility. Use native allow/deny policy to allow only native
Web tools and disable project context, custom MCPs, skills, plugins, hooks,
shell, curl, and scripts. Preserve native system behavior. Eligibility requires
invocation and config evidence, an event stream with no forbidden tool call, and
an unchanged isolated working directory. If the CLI cannot enforce or expose
enough evidence, retain the failed probe and open a challenged ADR for another
locally observable restriction; never claim isolation from prompt text alone and
never silently drop the teacher.

Codex is the single teacher. A second CLI teacher was removed by ADR-0006 after
the Claude provider became unusable mid-refresh; the failed probes are retained
as evidence. Adding any future second teacher requires a new challenged ADR.

Corpus composition: six technical/docs, three current/news, three
academic/primary, three community/contradictory, three general multilingual,
and two ambiguous/difficult/no-good-answer cases.

Capture every observable search query, tool result, opened/cited URL, selected
source, evidence passage, final answer, model, CLI version, locale, date, and
duration. Sanitize only credentials, session/account IDs, absolute machine
paths, and unrelated local metadata; commit the remaining raw traces.

Codex derives a structured fixture from its traces; a deterministic, LLM-free
grounding verifier independently confirms that every derived claim is literally
supported by the captured trace. Only trace-grounded claims survive, and every
rejection is archived with its reason. The result is the baseline for extractor
and search quality decisions, never an oracle of truth.

## Spike S2 — Bun.WebView to Obscura

Pin Bun 1.4.0 and one Obscura stealth version. The spike passes only if it:

1. starts and owns Obscura on loopback and obtains its full browser-level CDP
   WebSocket URL;
2. connects `Bun.WebView` explicitly to that URL without discovering Chrome;
3. creates/closes targets, navigates a deterministic fixture and a public JS
   page, evaluates rendered DOM, requests `DOM.getDocument`, and extracts text
   and links;
4. runs six destination views concurrently and at least 100 sequential
   navigations;
5. closes a view without killing Obscura and exits with no orphan process;
6. repeats the essential probe from the packed npm artifact if packaging changes
   runtime behavior.

If every condition passes, production uses one Bun.WebView adapter. If any
condition fails reproducibly, a challenged decision selects one minimal direct
Bun WebSocket CDP adapter. Production never ships both paths simultaneously.

## Spike S3 — Obscura capacity

Measure concurrency 1, 4, 8, 16, 24, 32, and 40 across static, JS-heavy, slow,
technical, news, community, and error pages. Run cold and warm trials and at
least 100 navigations. Record total MCP+Obscura RSS, CPU, throughput, P50/P95
latency, timeout/error rate, event-loop responsiveness, and orphan resources.

The report calibrates the deterministic adaptive controller. The normative
bounds remain start 8, maximum 40, maximum 2 per host, and one Google SERP.
It publishes the safe RSS budget, warm P95 baseline, last safe capacity, and
controller fixture consumed by SPEC-02; missing memory telemetry, a new-machine
profile, 8→higher growth, and persisted-profile reuse are tested.

## Spike S4 — Extraction against teachers

Obscura's native rendered Markdown is the first baseline. Compare its output to
the teacher fixtures: evidence coverage, noise, links, headings, tables, code,
size, latency, and memory. Only a measured gap can introduce another candidate
such as Readability. Every candidate is local, Bun-compatible, keyless, and
tested on the same corpus. No extractor is adopted because of reputation alone.

## Spike S5 — Tooling and optional dependencies

- Prove `@/` alias resolution in Bun, TypeScript 7, Oxlint, and tests.
- Publish an Oxlint coverage matrix and prove supported architecture/complexity
  rules with positive and negative fixtures, including cycles, aliases, and
  dynamic imports. Trial a maintained Oxlint-compatible boundary plugin only if
  native rules cannot express the feature rule; discard it if unstable. Record
  unsupported rules in the required ADR and never implement a custom linter.
- Probe FTS5 and its degraded path, PDF.js, a robots parser, SDK MCP+Zod under
  Bun, `bunx --bun` packed execution, and OpenCode JSON/subagent/session flows.

## Decision output

Each spike PR commits `docs/spikes/<spike-id>/report.md`, exact versions,
commands, environment facts, machine-readable measurements, raw logs or hashes,
and a challenge record. A report distinguishes measured fact, inference, and
decision. Failed spikes are retained.

## Acceptance

Owned requirements: `TEST-006` through `TEST-013`, `TEST-020` through
`TEST-023`, `RENDER-005`, `ARCH-005`, and `ARCH-006`. The spec is accepted when
all reports exist and every conditional production choice has exactly one
selected path.
