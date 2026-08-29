import { expect, test } from "bun:test";

import { inspectClaudeProbe, inspectCodexProbe } from "./contract.ts";

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
