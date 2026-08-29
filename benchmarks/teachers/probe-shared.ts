export type CodexInspection = {
  accepted: boolean;
  searches: number;
  forbidden_tool_calls: string[];
  cited_urls: string[];
};

export type ClaudeInspection = {
  accepted: boolean;
  tool_calls: string[];
  forbidden_tool_calls: string[];
  authentication_failed: boolean;
};
export type ClaudeToolCall = { name: string; input: Record<string, unknown> };

/** Mutable tallies accumulated while walking one Claude event stream. */
export type ClaudeProbeState = {
  calls: string[];
  forbidden: Set<string>;
  toolIds: Map<string, ClaudeToolCall>;
  initAccepted: boolean;
  successfulResult: boolean;
  authenticationFailed: boolean;
  validSearches: number;
  searchResults: number;
  initEvents: number;
  resultEvents: number;
};

export const codexForbiddenTypes = new Set([
  "collab_tool_call",
  "command_execution",
  "computer_tool_call",
  "custom_tool_call",
  "dynamic_tool_call",
  "file_change",
  "function_call",
  "local_shell_call",
  "mcp_tool_call",
  "shell_command",
  "tool_call",
]);
export const codexEventTypes = new Set([
  "error",
  "item.completed",
  "item.started",
  "thread.started",
  "turn.completed",
  "turn.started",
]);
export const codexItemTypes = new Set(["agent_message", "error", "reasoning", "web_search"]);
export const claudeAllowedTools = new Set(["WebSearch", "WebFetch"]);
export const claudeAssistantContentTypes = new Set(["text", "thinking", "tool_use"]);
export const claudeForbiddenInvocationTypes = new Set([
  "function_call",
  "shell_command",
  "tool_call",
]);
export const claudeEventTypes = new Set([
  "assistant",
  "rate_limit_event",
  "result",
  "stream_event",
  "system",
  "tool_progress",
  "user",
]);
export const claudeSystemSubtypes = new Set(["init", "status", "thinking_tokens"]);
