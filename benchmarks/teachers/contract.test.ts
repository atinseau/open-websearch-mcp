import { expect, test } from "bun:test";

import {
  inspectClaudeProbe,
  inspectCodexProbe,
  normalizeTeacherRun,
  validateCorpus,
  validateTeacherRun,
} from "./contract.ts";

function validClaudeEvents(): unknown[] {
  return [
    {
      type: "system",
      subtype: "init",
      model: "claude-opus-5",
      tools: ["WebFetch", "WebSearch"],
      mcp_servers: [],
      skills: [],
      plugins: [],
    },
    {
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "search-1", name: "WebSearch", input: { query: "Claude CLI" } },
        ],
      },
    },
    {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "search-1", content: "results" }],
      },
      tool_use_result: {
        query: "Claude CLI",
        results: [{ title: "Claude CLI", url: "https://code.claude.com/docs" }],
      },
    },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      terminal_reason: "completed",
      permission_denials: [],
      subagent_stats: { spawned: 0 },
      result: "See https://code.claude.com/docs.",
    },
  ];
}

test("normalizes observable Codex and Claude Web evidence", () => {
  const codex = normalizeTeacherRun(
    "codex",
    [
      {
        type: "item.completed",
        item: {
          type: "web_search",
          query: "Bun release",
          action: { type: "search" },
        },
      },
      {
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "Bun shipped. https://bun.com/blog/bun-v1.4",
        },
      },
    ],
    "gpt-5.6",
  );
  expect(codex).toMatchObject({
    model: "gpt-5.6",
    queries: ["Bun release"],
    cited_urls: ["https://bun.com/blog/bun-v1.4"],
    final_answer: "Bun shipped. https://bun.com/blog/bun-v1.4",
  });
  expect(codex.evidence_passages).toEqual([]);

  const claude = normalizeTeacherRun("claude", [
    { type: "system", subtype: "init", model: "claude-opus-5" },
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "WebSearch", input: { query: "Claude CLI" } }],
      },
    },
    {
      type: "user",
      message: { content: [{ type: "tool_result", content: "search output" }] },
      tool_use_result: {
        query: "Claude CLI",
        results: [
          {
            content: [
              { title: "CLI reference", url: "https://code.claude.com/docs/en/cli" },
              { title: "Unselected result", url: "https://example.com/not-cited" },
            ],
          },
          "The surfaced search summary.",
        ],
      },
    },
    {
      type: "result",
      is_error: false,
      result: "See https://code.claude.com/docs/en/cli.",
    },
  ]);
  expect(claude).toMatchObject({
    model: "claude-opus-5",
    queries: ["Claude CLI"],
    cited_urls: ["https://code.claude.com/docs/en/cli"],
    selected_sources: [{ title: "CLI reference", url: "https://code.claude.com/docs/en/cli" }],
  });
  expect(claude.tool_results).toContainEqual({
    tool: "WebSearch",
    summary: "The surfaced search summary.",
  });
  expect(claude.evidence_passages).toEqual([]);
});

test("classifies Codex other URL actions as opened pages rather than queries", () => {
  const normalized = normalizeTeacherRun("codex", [
    {
      type: "item.completed",
      item: {
        type: "web_search",
        query: "SQLite FTS5 documentation",
        action: { type: "search" },
      },
    },
    {
      type: "item.completed",
      item: {
        type: "web_search",
        query: "'external content' in https://www.sqlite.org/fts5.html",
        action: { type: "other" },
      },
    },
  ]);

  expect(normalized.queries).toEqual(["SQLite FTS5 documentation"]);
  expect(normalized.opened_urls).toEqual(["https://www.sqlite.org/fts5.html"]);
});

test("removes Markdown delimiters from cited URLs", () => {
  const normalized = normalizeTeacherRun(
    "codex",
    [
      {
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "See `https://日本語.jp/` and https://example.com/Foo_(bar).",
        },
      },
    ],
    "gpt-5.4",
  );

  expect(normalized.cited_urls).toEqual(["https://日本語.jp/", "https://example.com/Foo_(bar)"]);
});

test("preserves legal trailing URL path characters", () => {
  const normalized = normalizeTeacherRun(
    "codex",
    [
      {
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "See https://example.com/path_ and https://example.com/path~",
        },
      },
    ],
    "gpt-5.4",
  );

  expect(normalized.cited_urls).toEqual(["https://example.com/path_", "https://example.com/path~"]);
});

test("accepts Codex only when native Web search completes without forbidden tools", () => {
  const events: unknown[] = [
    { type: "thread.started", thread_id: "thread" },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: {
        type: "web_search",
        query: "official Bun release",
        action: { type: "search" },
      },
    },
    {
      type: "item.completed",
      item: {
        type: "agent_message",
        text: "Bun is documented at https://bun.com/docs.",
      },
    },
    { type: "turn.completed" },
  ];

  expect(inspectCodexProbe(events)).toEqual({
    accepted: true,
    searches: 1,
    forbidden_tool_calls: [],
    cited_urls: ["https://bun.com/docs"],
  });
  events.splice(3, 0, {
    type: "item.completed",
    item: { type: "command_execution", command: "curl example.com" },
  });
  expect(inspectCodexProbe(events).accepted).toBeFalse();
});

test("reports Claude authentication and tool-policy failures from its event stream", () => {
  const events = validClaudeEvents();

  expect(inspectClaudeProbe(events)).toEqual({
    accepted: true,
    tool_calls: ["WebSearch"],
    forbidden_tool_calls: [],
    authentication_failed: false,
  });
  events[1] = {
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "WebFetch" }] },
  };
  expect(inspectClaudeProbe(events).accepted).toBeFalse();
  events[1] = {
    type: "assistant",
    message: {
      content: [
        { type: "tool_use", id: "search-1", name: "WebSearch", input: { query: "Claude CLI" } },
      ],
    },
  };
  events[0] = {
    type: "system",
    subtype: "init",
    model: "claude-opus-5",
    tools: ["WebFetch", "WebSearch"],
    mcp_servers: [],
    skills: [],
    plugins: [{ name: "custom-plugin" }],
  };
  expect(inspectClaudeProbe(events).accepted).toBeFalse();
  events[0] = {
    type: "system",
    subtype: "init",
    model: "claude-opus-5",
    tools: ["WebFetch", "WebSearch"],
    mcp_servers: [],
    skills: [],
    plugins: [],
  };
  events[3] = {
    type: "result",
    is_error: true,
    result: "Failed to authenticate: OAuth session expired",
  };
  expect(inspectClaudeProbe(events)).toMatchObject({
    accepted: false,
    authentication_failed: true,
  });
});

test("requires a completed Claude result without denials or subagents", () => {
  const budgetExhausted = validClaudeEvents();
  budgetExhausted[3] = {
    type: "result",
    subtype: "error_max_budget_usd",
    is_error: false,
    terminal_reason: "budget_exceeded",
    permission_denials: [],
    subagent_stats: { spawned: 0 },
    result: "partial answer",
  };
  expect(inspectClaudeProbe(budgetExhausted).accepted).toBeFalse();

  const denied = validClaudeEvents();
  denied[3] = {
    type: "result",
    subtype: "success",
    is_error: false,
    terminal_reason: "completed",
    permission_denials: [{ tool_name: "Bash" }],
    subagent_stats: { spawned: 1 },
    result: "answer",
  };
  expect(inspectClaudeProbe(denied).accepted).toBeFalse();
});

test("rejects ambiguous or uncorrelated provider event streams", () => {
  const claude = validClaudeEvents();
  claude.push({ type: "result", is_error: false, result: "duplicate" });
  expect(inspectClaudeProbe(claude).accepted).toBeFalse();
  claude.pop();
  claude[2] = {
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: "different-search", content: "results" }],
    },
    tool_use_result: {
      query: "Claude CLI",
      results: [{ title: "Claude CLI", url: "https://code.claude.com/docs" }],
    },
  };
  expect(inspectClaudeProbe(claude).accepted).toBeFalse();
  claude.push({ type: "unexpected-provider-event" });
  expect(inspectClaudeProbe(claude).forbidden_tool_calls).toContain(
    "event:unexpected-provider-event",
  );
  const nestedTool = validClaudeEvents();
  nestedTool.push({
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "tool_use", name: "Bash", input: { command: "curl example.com" } },
    },
  });
  expect(inspectClaudeProbe(nestedTool).forbidden_tool_calls).toContain("Bash");
  const extraResult = validClaudeEvents();
  extraResult.push({
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: "unknown-search", content: "results" }],
    },
    tool_use_result: { query: "other", results: [{ url: "https://example.com" }] },
  });
  expect(inspectClaudeProbe(extraResult).forbidden_tool_calls).toContain(
    "tool_result:uncorrelated:unknown-search",
  );
  const serverTool = validClaudeEvents();
  serverTool.push({
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "server_tool_use", name: "computer" },
    },
  });
  expect(inspectClaudeProbe(serverTool).forbidden_tool_calls).toContain("server_tool_use:computer");
  const nestedProgress = validClaudeEvents();
  nestedProgress.push({
    type: "stream_event",
    event: { type: "tool_progress", tool_name: "Bash" },
  });
  expect(inspectClaudeProbe(nestedProgress).forbidden_tool_calls).toContain("tool_progress:Bash");
  const toolProgress = validClaudeEvents();
  toolProgress.push({ type: "tool_progress", tool_name: "Bash" });
  expect(inspectClaudeProbe(toolProgress).forbidden_tool_calls).toContain("tool_progress:Bash");
  const mixedResults = validClaudeEvents();
  mixedResults[2] = {
    type: "user",
    message: {
      content: [
        { type: "tool_result", tool_use_id: "search-1", content: "results" },
        { type: "tool_result", tool_use_id: "unknown-result", content: "unexpected" },
      ],
    },
    tool_use_result: {
      query: "Claude CLI",
      results: [{ title: "Claude CLI", url: "https://code.claude.com/docs" }],
    },
  };
  expect(inspectClaudeProbe(mixedResults).forbidden_tool_calls).toContain(
    "tool_result:uncorrelated:unknown-result",
  );
  const malformedResults = validClaudeEvents();
  malformedResults[2] = {
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: "search-1", content: "results" }],
    },
    tool_use_result: { query: "different query", results: [null] },
  };
  expect(inspectClaudeProbe(malformedResults).forbidden_tool_calls).toEqual(
    expect.arrayContaining(["WebSearch:query-mismatch", "WebSearch:empty-result"]),
  );
  const missingModel = validClaudeEvents();
  missingModel[0] = {
    type: "system",
    subtype: "init",
    tools: ["WebFetch", "WebSearch"],
    mcp_servers: [],
    skills: [],
    plugins: [],
  };
  expect(inspectClaudeProbe(missingModel).accepted).toBeFalse();

  const codex: unknown[] = [
    {
      type: "item.completed",
      item: { type: "web_search", query: "query", action: { type: "search" } },
    },
    {
      type: "item.completed",
      item: { type: "agent_message", text: "https://example.com" },
    },
    { type: "turn.completed" },
    { type: "item.completed", item: { type: "unknown_tool" } },
  ];
  expect(inspectCodexProbe(codex).accepted).toBeFalse();
  const nestedCodex = codex.slice(0, 3);
  nestedCodex.push({
    type: "turn.started",
    metadata: { item: { type: "command_execution", command: "curl example.com" } },
  });
  expect(inspectCodexProbe(nestedCodex).forbidden_tool_calls).toContain("command_execution");
  const genericNestedCodex = codex.slice(0, 3);
  genericNestedCodex.push({
    type: "turn.started",
    metadata: { call: { type: "shell_command", command: "curl example.com" } },
  });
  expect(inspectCodexProbe(genericNestedCodex).forbidden_tool_calls).toContain("shell_command");
  const genericNestedClaude = validClaudeEvents();
  genericNestedClaude.push({
    type: "stream_event",
    event: { type: "function_call", name: "Bash", arguments: { command: "curl example.com" } },
  });
  expect(inspectClaudeProbe(genericNestedClaude).forbidden_tool_calls).toContain(
    "function_call:Bash",
  );
});

test("rejects malformed provider events without throwing", () => {
  expect(inspectCodexProbe([{ type: "item.completed" }, null])).toMatchObject({
    accepted: false,
    forbidden_tool_calls: expect.arrayContaining(["event:malformed"]),
  });
  expect(inspectClaudeProbe([{ type: "assistant" }, null])).toMatchObject({
    accepted: false,
    forbidden_tool_calls: expect.arrayContaining(["event:malformed"]),
  });
});

test("uses one provider-neutral Web research prompt", async () => {
  const prompt = await Bun.file(new URL("prompt.md", import.meta.url)).text();

  expect(prompt.match(/\{\{question\}\}/g)).toHaveLength(1);
  expect(prompt).toContain("native Web search");
  expect(prompt).toContain("Cite every factual claim");
  expect(prompt).not.toMatch(/site:|search exactly|queries|domains|results|steps/i);
});

test("versions machine-readable run and fixture schemas", async () => {
  const runSchema = await Bun.file(
    new URL("schemas/teacher-run.schema.json", import.meta.url),
  ).json();
  const fixtureSchema = await Bun.file(
    new URL("schemas/teacher-fixture.schema.json", import.meta.url),
  ).json();

  expect(runSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(runSchema.required).toContain("evidence_passages");
  expect(fixtureSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(fixtureSchema.properties.claims.items.required).toContain("provenance");
});

test("accepts the exact 20-case category split", async () => {
  const corpus = await Bun.file(new URL("corpus.json", import.meta.url)).json();

  expect(validateCorpus(corpus)).toEqual({
    total: 20,
    categories: {
      technical_docs: 6,
      current_news: 3,
      academic_primary: 3,
      community_contradictory: 3,
      multilingual: 3,
      ambiguous_difficult: 2,
    },
  });
});

test("rejects case IDs that can escape the corpus directory", async () => {
  const corpus = await Bun.file(new URL("corpus.json", import.meta.url)).json();
  corpus.cases[0].id = "../../escape";

  expect(() => validateCorpus(corpus)).toThrow("path-safe lowercase slug");
});

test("requires every observable field in a teacher run", () => {
  const run = {
    schema_version: 1,
    run_id: "2026-08-27_codex_technical-bun-release",
    case_id: "technical-bun-release",
    provider: "codex",
    model: "gpt-5.6",
    cli_version: "0.149.1",
    locale: "en-US",
    started_at: "2026-08-27T12:00:00Z",
    duration_ms: 1234,
    prompt_sha256: "a".repeat(64),
    queries: ["latest stable Bun release"],
    tool_results: [{ tool: "web_search", summary: "Official Bun result" }],
    opened_urls: ["https://bun.com/blog/bun-v1.3.14"],
    cited_urls: ["https://bun.com/blog/bun-v1.3.14"],
    selected_sources: [{ url: "https://bun.com/blog/bun-v1.3.14", title: "Bun v1.3.14" }],
    evidence_passages: [
      {
        url: "https://bun.com/blog/bun-v1.3.14",
        text: "Bun v1.3.14 is now available.",
      },
    ],
    final_answer: "Bun v1.3.14 is the latest stable release.",
    raw_trace: "events.sanitized.jsonl",
    policy_evidence: "policy.json",
    isolation: {
      temporary_cwd: true,
      cwd_unchanged: true,
      forbidden_tool_calls: [],
    },
  };

  expect(validateTeacherRun(run)).toEqual({ provider: "codex", observations: 6 });
  expect(() =>
    validateTeacherRun({ ...run, raw_trace: "../../unmanifested-events.jsonl" }),
  ).toThrow("canonical adjacent trace");
  expect(() => validateTeacherRun({ ...run, policy_evidence: "../../other.json" })).toThrow(
    "canonical adjacent policy",
  );
  expect(validateTeacherRun({ ...run, queries: [] })).toEqual({
    provider: "codex",
    observations: 6,
  });
  expect(() => validateTeacherRun({ ...run, schema_version: 2 })).toThrow("schema_version");
  expect(() => validateTeacherRun({ ...run, duration_ms: 1.5 })).toThrow("integer");
  expect(() => validateTeacherRun({ ...run, started_at: "2026-02-30T12:00:00Z" })).toThrow(
    "date-time",
  );
  expect(() => validateTeacherRun({ ...run, unexpected: true })).toThrow("unexpected property");
});
