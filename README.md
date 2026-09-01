# Open WebSearch MCP

> Give an agent that has no native Web tool a small, local, and evidence-first
> window onto the public Web.

`open-websearch-mcp` is a local-first [Model Context Protocol](https://modelcontextprotocol.io/)
server for agents running inside a restricted harness: Codex, a custom agent,
or any MCP client that can launch a local stdio process but cannot search or
open public pages itself.

It does not put another model between your agent and the Web. Instead, it
discovers public pages, renders them locally, extracts the useful parts, and
returns compact **evidence passages** with their source, location, links, and
provenance. Your agent stays responsible for asking questions, choosing what
to open next, and drawing conclusions.

## Why this exists

Many capable agents live in deliberately constrained environments. They can
reason over a repository, a ticket, or a private dataset, but their harness has
no browser and no Web-search tool. Giving those agents unrestricted browser
automation is usually the wrong fix: it adds opaque behavior, personal-session
access, and a pile of new security assumptions.

Open WebSearch fills the smaller gap:

```text
agent with a question
        │
        │ web_search / web_open
        ▼
Open WebSearch MCP ──► public Web evidence
        │                    │
        │ compact, attributed │ rendered locally
        ▼                    ▼
agent keeps reasoning     sources stay inspectable
```

The promise is not an answer generator. It is a reliable way to give a model
the current, attributable material it needs to reason well when its own harness
is otherwise offline from the Web.

> **Important:** “offline harness” does not mean an air-gapped machine. The
> MCP host needs normal outbound Internet access to reach public sites. It does
> not search a private index or work without a network.

## What you get

- Exactly two MCP tools: `web_search` and `web_open`.
- Public-Web discovery via configurable, ordered front ends: Google,
  DuckDuckGo, then Bing by default. If one is blocked, discovery advances to
  the next configured engine.
- Locally rendered, JavaScript-capable pages through the pinned Obscura stealth
  renderer.
- Ranked, source-located evidence passages rather than a model-written
  synthesis.
- Investigation memory: a page already emitted in an investigation is not
  emitted again, while a local cache can still save repeated work.
- Clear, structured outcomes for partial results, paywalls, CAPTCHA/WAF blocks,
  timeouts, unsupported documents, and local renderer failures.

## What it deliberately does not do

- It does not run an LLM, invent an answer, or use a search API.
- It does not read Chrome, browser cookies, keychains, authenticated sessions,
  or private resources.
- It does not solve CAPTCHAs, bypass paywalls or WAFs, rotate identity, or use
  proxy rotation.
- It does not provide a daemon, HTTP server, telemetry, or multi-user service.
- It does not substitute another renderer when Obscura is unavailable.

This boundary is intentional. The Web is useful evidence, but it is also
untrusted input: active and hidden markup is removed, and returned page content
is explicitly labelled `external_untrusted`.

## Start here

Open WebSearch is a stdio server: your MCP harness launches it. It is not a
command-line search UI and it does not need a daemon.

Requirements: macOS on Apple Silicon and Bun 1.4.0.

For a one-off trial, a compatible harness can run:

```sh
bunx --bun open-websearch-mcp@latest
```

For an installed harness, use Bun's absolute path and pin the exact version.
That makes an investigation reproducible and prevents a future release from
changing a running setup unexpectedly.

```sh
which bunx
```

### Codex configuration

Codex is the verified harness for this release. Add this to its MCP
configuration, replacing the command path with the output of `which bunx`:

```toml
[mcp_servers.open_websearch]
command = "/absolute/path/to/bunx"
args = ["--bun", "open-websearch-mcp@0.2.1"]
```

Configuration examples for Claude Code, Gemini CLI, and OpenCode are available
in the [integration guide](https://github.com/atinseau/open-websearch-mcp/tree/main/docs/integrations).
They are useful starting points, but only Codex is a verified compatibility
claim.

On its first Web call, the MCP may download, verify, and install its pinned
Obscura sidecar into its private Workspace. That first call can therefore take
longer than later calls.

## The two tools

### `web_search`

Use it when the agent needs to discover evidence for a question. The agent's
query is preserved; it can use quoted phrases and search operators. Search
returns up to ten ranked public pages, normally five by default.

```ts
web_search({
  query: "Bun WebView Model Context Protocol stdio server",
  profile: "technical",
  locale: "en",
  max_results: 5,
})
```

Each response includes an `investigation_id`. Reuse it for the next search when
you want fresh pages rather than the same evidence again. Results carry a
`status` (`success`, `partial`, `no_relevant_results`, `blocked`, or `error`),
a confidence signal, page provenance, and focused evidence passages.

### `web_open`

Use it when the agent has chosen one public URL and wants to inspect it. A
`focus` phrase deterministically prioritizes the relevant parts of a long page;
it never triggers an additional search or follows second-hop links.

```ts
web_open({
  url: "https://example.org/reference",
  focus: "installation and compatibility requirements",
  max_chars: 12_000,
})
```

The returned links are data for the agent to evaluate. Only an explicit,
subsequent `web_open` may navigate to one.

## How a search becomes evidence

1. The agent writes the question and calls `web_search`.
2. The MCP checks its local cache and asks the first configured discovery
   engine. A blocked or failed engine falls through in order; an honest empty
   result remains an empty result.
3. It selects public candidates, then renders them locally with Obscura under
   bounded concurrency, time, transfer, and per-host limits.
4. It strips active content, extracts readable structure and code separately,
   and ranks focused passages deterministically.
5. The agent receives compact evidence, source URLs, stable investigation
   context, and transparent status instead of a fabricated summary.

Everything mutable stays in `~/.open-websearch-mcp/`: configuration, SQLite
metadata, cached content, investigation state, logs, and the pinned renderer.
The repository and npm package never receive that private runtime state.

### Configure discovery order

The first Web call creates a commented `config.toml` in the Workspace. The
default is:

```toml
[search]
engines = ["google", "duckduckgo", "bing"]
```

You can reorder the engines or remove one. The configuration is validated on
reload; an unknown or duplicate engine is rejected with a diagnostic rather
than silently ignored.

## Trust and operating boundaries

| Concern | Behaviour |
| --- | --- |
| Public network only | Private addresses, credentials in URLs, hostile redirects, and unsafe schemes are rejected. |
| Web content | Returned as untrusted evidence; it cannot trigger tools, code, or navigation. |
| Personal data | No browser profile, cookies, keychain, or authenticated session is adopted. |
| Access controls | CAPTCHA, WAF, paywall, consent, and authentication blocks are reported — never bypassed. |
| Reproducibility | Pin the npm version; cache and consumed-page state are local and attributed. |

## For contributors

```sh
bun install --frozen-lockfile
bun run check
```

`bun run check` is the same deterministic gate used for pull requests and npm
publication. It runs formatting, strict and type-aware linting, type checking,
the full test suite, and the orchestration-state validation.

The design and non-negotiable boundaries live in the
[specification](https://github.com/atinseau/open-websearch-mcp/blob/main/SPEC.md).
The terminology behind investigations and evidence passages is in the
[domain context](https://github.com/atinseau/open-websearch-mcp/blob/main/CONTEXT.md).
The release package is Apache-2.0 licensed; its npm tarball contains only the
runtime, executable wrapper, metadata, and required license files — not tests,
caches, private state, or the Obscura binary.
