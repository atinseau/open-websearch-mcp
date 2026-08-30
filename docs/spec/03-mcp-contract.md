# SPEC-03 — MCP and tool contract

## Transport

Use the official MCP TypeScript SDK over `stdio`. `stdout` contains MCP frames
only. Zod validates inputs and other untrusted interface data; validated domain
values cross into application modules. Maximum inbound MCP message size is
4 MiB. Calls may execute concurrently and respond out of order by JSON-RPC ID.

Support protocol negotiation for `2024-11-05` and `2025-06-18` at minimum.
Newer revisions become supported only after the verified Codex compatibility
matrix passes. Advertise tools only; do not add resources, prompts, sampling,
elicitation, tasks, or HTTP transport in v1.

## `web_search`

```ts
{
  query: string;
  investigation_id?: string;
  max_results?: number; // integer 1..10, default 5
  profile?: "auto" | "general" | "technical" | "news" | "academic" | "community";
  locale?: string;
}
```

`query` is sent to Google without silent rewriting. If the investigation ID is
absent, create one. Always return the effective ID.

## `web_open`

```ts
{
  url: string;
  investigation_id?: string;
  focus?: string;
  max_chars?: number; // default 12_000, maximum 25_000
}
```

`focus` ranks passages deterministically; it does not launch a search or cause
navigation. Without focus, return main content in document order. The URL is
the only page this tool may open. It becomes consumed only after an exploitable
response has been fully prepared for emission; render/extraction failures do
not consume it.

## Common structured result

```ts
{
  investigation_id: string;
  status: "success" | "partial" | "no_relevant_results" | "blocked" | "error";
  reason?: "renderer_unavailable" | "authentication_required" |
    "consent_required" | "paywall" | "captcha" | "waf" |
    "unsupported_format" | "unsupported_or_ocr_required" |
    "timeout" | "network_error" | "internal_error";
  confidence: "high" | "medium" | "low";
  results: Array<{
    title: string;
    url: string;
    final_url: string;
    discovery: "google" | "local_cache" | "direct_open";
    source_type: string;
    mime_type: string;
    published_at?: string;
    fetched_at: string;
    score: number; // 0..1
    trust: "external_untrusted";
    passages: Array<{
      text: string;
      score: number;
      heading?: string;
      fragment?: string;
      document_page?: number;
      passage_hash: string;
    }>;
    code_blocks: Array<{
      text: string;
      language?: string;
      trust: "external_untrusted";
      invisible_character_warnings: string[];
      heading?: string;
      fragment?: string;
      document_page?: number;
      content_hash: string;
    }>;
    content_links: Array<{
      title: string;
      url: string;
      context?: string;
    }>;
    navigation_links: Array<{
      title: string;
      url: string;
    }>;
    content_hash: string;
  }>;
  suggested_queries?: Array<{
    query: string;
    source: "google_related" | "google_question";
  }>;
}
```

The MCP returns both canonical compact text in `content` and semantically
complete `structuredContent`. Essential information exists in both so clients
that ignore one representation still work. Internal feature weights, raw SERP
positions, cache decisions, and step timings appear only in configured
diagnostics.

Canonical text renders every `code_blocks` entry as a fenced block plus its
untrusted/warning/localizer metadata. It never flattens code into prose or hides
metadata that exists in `structuredContent`.

## Status semantics

- `success`: requested useful evidence count was satisfied.
- `partial`: some evidence exists but quality/count is weak or some sources
  were blocked.
- `no_relevant_results`: no extracted page has any query relationship.
- `blocked`: discovery/rendering was wholly prevented.
- `error`: local invariant, validation, installation, or runtime failure.

`reason` is mandatory for `blocked` and `error`, and whenever a partial result
needs an actionable explanation. In particular, Obscura installation or smoke
test failure is `error` + `renderer_unavailable`; cached results identify
themselves per result with `discovery: "local_cache"`.

A low-scoring best result is returned as `partial`/`low`; runtime relevance is
not presented as teacher conformity.

Protocol/validation failures use MCP errors. Expected Web outcomes use a
successful tool result with status and `isError` only where SDK/client
compatibility requires it.

## Cancellation and lifecycle

Honor MCP cancellation cooperatively and idempotently: remove queued work,
abort network/navigation, close owned targets, release scheduler slots, and
respect consumed-page reservation semantics. Internal timeouts apply even when
a client never sends cancellation. EOF closes SQLite and only the owned Obscura
process.

## Acceptance

Owned requirements: `MCP-001` through `MCP-013`. `PROD-005` is a required
cross-spec outcome owned by SPEC-00. Contract tests
must execute the official SDK client against the real stdio server and the
versioned Codex compatibility probe. The official-SDK contract tests continue
to exercise both supported protocol revisions and therefore do not couple the
server implementation to Codex.
