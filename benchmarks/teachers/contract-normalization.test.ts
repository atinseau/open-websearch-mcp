import { expect, test } from "bun:test";

import { normalizeTeacherRun } from "./contract.ts";

test("normalizes observable Codex and Claude Web evidence", () => {
  expectCodexNormalization();
  expectClaudeNormalization();
});

function expectCodexNormalization(): void {
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
}

function expectClaudeNormalization(): void {
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
}

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
