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
