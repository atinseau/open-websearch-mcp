# Open WebSearch MCP — master specification

## Authority

This file is the product-spec entrypoint. The linked files in `docs/spec/` own
the detailed requirements. Requirement IDs are stable: code, tests, PRs,
checkpoints, and reviews must cite them. `docs/research/` records supporting
evidence and rejected assumptions; it is non-normative.

When two normative requirements appear incompatible, the orchestrator opens a
challenge record and resolves the contradiction before implementation. It does
not weaken either requirement silently.

## Product outcome

Deliver a public, local-first MCP server that gives Codex, Claude Code, Gemini
CLI, OpenCode, and other MCP clients provider-quality Web research over public
resources. Google front-end pages provide live discovery. Obscura provides local
JavaScript rendering. Deterministic extraction, ranking, caching, and
investigation memory produce compact, source-located evidence for the calling
agent. The MCP contains no LLM and calls no search API.

## Non-negotiable invariants

| ID | Requirement |
| --- | --- |
| PROD-001 | The runtime is local-first and single-user on macOS ARM64 v1. |
| PROD-002 | Google front-end navigation and public destination pages are the only live discovery dependencies; no search SaaS/API or API key is used. |
| PROD-003 | The MCP is algorithmic. The calling agent owns investigation and reasoning; no generative model runs inside the MCP. |
| PROD-004 | Obscura stealth is mandatory. There is no curl, WebFetch, WKWebView, or alternate-renderer fallback in production. |
| PROD-005 | Product code and project commands use Bun and Web-standard interfaces, never direct Node imports or Node tooling. Dependencies may use Bun's compatibility layer internally. |
| PROD-006 | Page content is external untrusted evidence. It cannot instruct the MCP, execute code, or trigger autonomous navigation. |
| PROD-007 | A consumed page is emitted at most once per investigation; exploration alone never consumes it. |
| PROD-008 | Every observable claim of completion is backed by an automated check, benchmark artifact, or reproducible trace. |
| PROD-009 | Every implementation change uses an isolated worktree and reaches `main` through a reviewed PR. |
| PROD-010 | The implementation loop continues until every mandatory requirement is verified; it may stop early only for a proven external-authority blocker. |

## Public product surface

The server exposes two tools over MCP `stdio`:

- `web_search`: accepts an agent-authored Google query, discovers and renders
  candidates, and returns ranked evidence pages not previously consumed in the
  investigation.
- `web_open`: renders one agent-selected public URL and returns focused or
  document-ordered evidence plus useful links.

Both tools return a canonical text representation and equivalent structured
content. Both can create an investigation implicitly and always return its ID.

## Normative sub-specifications

| Spec | Owns |
| --- | --- |
| [Requirement registry](docs/spec/requirements.md) | every atomic requirement ID, acceptance criterion, dependency, and decision source |
| [00 Product contract](docs/spec/00-product-contract.md) | scope, user-visible behavior, terminology, exclusions |
| [01 Feasibility spikes](docs/spec/01-feasibility-spikes.md) | teacher capture, WebView/Obscura, load, extraction, lint, packaging probes |
| [02 Architecture and runtime](docs/spec/02-architecture-runtime.md) | Bun/TS7, deep modules, feature seams, dependency direction, scheduler |
| [03 MCP contract](docs/spec/03-mcp-contract.md) | SDK, Zod schemas, tools, portable results, errors, cancellation |
| [04 Discovery](docs/spec/04-discovery-google.md) | Google SERP behavior, candidate budgets, suggestions, retries |
| [05 Rendering and extraction](docs/spec/05-rendering-extraction.md) | Obscura lifecycle, formats, passages, links, code and documents |
| [06 Ranking, cache, investigations](docs/spec/06-ranking-cache-investigations.md) | scoring, deduplication, SQLite, TTL, consumption |
| [07 Security and trust](docs/spec/07-security-trust.md) | SSRF, robots, untrusted content, limits and public-only policy |
| [08 Configuration and operations](docs/spec/08-configuration-operations.md) | workspace, TOML, logs, diagnostics, recovery |
| [09 Verification and benchmarks](docs/spec/09-verification-benchmarks.md) | Bun tests, teacher fixtures, deterministic grader, quality gates |
| [10 Packaging and releases](docs/spec/10-packaging-releases.md) | npm/bunx UX, GitHub PRs, changelog, release from main |

## Delivery graph

The implementation is evidence-first:

```text
repository bootstrap + CI
            |
            v
teacher / WebView / load / lint / package spikes
            |
            v
contracts + config + storage + scheduler
            |
            v
Obscura + security + discovery + extraction
            |
            v
ranking + cache + web_open + web_search
            |
            v
teacher conformance + harness integration + resilience
            |
            v
npm release candidate + final audit
```

Only dependency-complete nodes may run in parallel. The executable DAG and
resume state are defined by [ORCHESTRATION.md](ORCHESTRATION.md).

## Product definition of done

The product is implemented only when all of the following are true on the exact
`main` commit proposed for release:

1. every mandatory requirement ID is linked to implementation, automated test,
   and verification evidence;
2. formatting, strict lint, type-aware lint, unit, contract, integration, MCP,
   security, load, and packaging gates pass;
3. the pinned Bun.WebView-to-Obscura path passes its release probe, or the
   challenged spike decision has selected the direct Bun WebSocket CDP adapter;
4. the deterministic teacher benchmark meets all thresholds in SPEC-09;
5. no critical/high review finding, orphan process, unsafe temporary file, or
   unresolved schema migration remains;
6. `bunx --bun <package>@<exact-version>` launches the packed artifact and
   completes MCP `initialize`, `tools/list`, and a fixture-backed tool call;
7. the traceability audit, documentation audit, and clean-checkout reproduction
   all pass;
8. the final checkpoint identifies the commit, package version, commands,
   reports, and immutable artifacts proving the preceding conditions.

## Explicitly outside v1

- authenticated browsing, private resources, user browser cookies, CAPTCHA
  solving, WAF challenge solving, proxy rotation, or paywall bypass;
- a proprietary global crawl/index comparable to Brave or Exa;
- a reasoning model, semantic answer generator, or remote reranking service in
  the MCP;
- OCR, audio transcription, video download, or native media playback;
- Windows, Linux, Docker, HTTP MCP transport, multi-user hosting, or telemetry;
- automatic fallback to a different renderer when Obscura is unavailable.
