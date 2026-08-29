import { array, extractedWebUrls, record } from "./contract-json.ts";

type CodexInspection = {
  accepted: boolean;
  searches: number;
  forbidden_tool_calls: string[];
  cited_urls: string[];
};

type ClaudeInspection = {
  accepted: boolean;
  tool_calls: string[];
  forbidden_tool_calls: string[];
  authentication_failed: boolean;
};
type ClaudeToolCall = { name: string; input: Record<string, unknown> };

const codexForbiddenTypes = new Set([
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
const codexEventTypes = new Set([
  "error",
  "item.completed",
  "item.started",
  "thread.started",
  "turn.completed",
  "turn.started",
]);
const codexItemTypes = new Set(["agent_message", "error", "reasoning", "web_search"]);
const claudeAllowedTools = new Set(["WebSearch", "WebFetch"]);
const claudeAssistantContentTypes = new Set(["text", "thinking", "tool_use"]);
const claudeForbiddenInvocationTypes = new Set(["function_call", "shell_command", "tool_call"]);
const claudeEventTypes = new Set([
  "assistant",
  "rate_limit_event",
  "result",
  "stream_event",
  "system",
  "tool_progress",
  "user",
]);
const claudeSystemSubtypes = new Set(["init", "status", "thinking_tokens"]);

export function inspectCodexProbe(events: unknown[]): CodexInspection {
  const forbidden = new Set<string>();
  const cited = new Set<string>();
  let searches = 0;
  let completed = 0;
  let policyError = false;

  for (const candidate of events) {
    try {
      const event = record(candidate, "Codex event");
      inspectNestedCodexItems(event, forbidden);
      const eventType = typeof event.type === "string" ? event.type : "unknown";
      if (!codexEventTypes.has(eventType)) forbidden.add(`event:${eventType}`);
      if (eventType === "error" && /hook|bypass/i.test(String(event.message))) policyError = true;
      if (eventType === "turn.completed") completed += 1;
      if (eventType !== "item.completed" && eventType !== "item.started") continue;
      const result = inspectCodexItem(
        record(event.item, "Codex item"),
        forbidden,
        cited,
        eventType === "item.completed",
      );
      searches += result.searches;
      policyError ||= result.policyError;
    } catch {
      forbidden.add("event:malformed");
    }
  }

  return {
    accepted:
      completed === 1 && searches > 0 && cited.size > 0 && forbidden.size === 0 && !policyError,
    searches,
    forbidden_tool_calls: [...forbidden],
    cited_urls: [...cited],
  };
}

export function inspectLegacyCodexProbe(events: unknown[]): CodexInspection {
  const forbiddenTypes = new Set([
    "command_execution",
    "file_change",
    "mcp_tool_call",
    "collab_tool_call",
  ]);
  const forbidden = new Set<string>();
  const cited = new Set<string>();
  let searches = 0;
  let completed = false;
  let policyError = false;
  for (const candidate of events) {
    const event = record(candidate, "legacy Codex event");
    if (event.type === "turn.completed") completed = true;
    if (event.type !== "item.completed") continue;
    const item = record(event.item, "legacy Codex item");
    const type = typeof item.type === "string" ? item.type : "unknown";
    if (forbiddenTypes.has(type)) forbidden.add(type);
    if (type === "error" && /hook|bypass/i.test(String(item.message))) policyError = true;
    if (type === "web_search") {
      const action = record(item.action, "legacy Codex Web Search action");
      if (action.type === "search" && typeof item.query === "string" && item.query.length > 0) {
        searches += 1;
      }
    }
    if (type === "agent_message" && typeof item.text === "string") {
      for (const url of extractedWebUrls(item.text)) cited.add(url);
    }
  }
  return {
    accepted: completed && searches > 0 && cited.size > 0 && forbidden.size === 0 && !policyError,
    searches,
    forbidden_tool_calls: [...forbidden],
    cited_urls: [...cited],
  };
}

function inspectNestedCodexItems(value: unknown, forbidden: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) inspectNestedCodexItems(entry, forbidden);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const object = record(value, "nested Codex event value");
  if (typeof object.type === "string" && codexForbiddenTypes.has(object.type)) {
    forbidden.add(object.type);
  }
  for (const entry of Object.values(object)) inspectNestedCodexItems(entry, forbidden);
}

function inspectCodexItem(
  item: Record<string, unknown>,
  forbidden: Set<string>,
  cited: Set<string>,
  completed: boolean,
): { searches: number; policyError: boolean } {
  const type = typeof item.type === "string" ? item.type : "unknown";
  if (codexForbiddenTypes.has(type)) forbidden.add(type);
  if (!codexItemTypes.has(type)) forbidden.add(`item:${type}`);
  if (type === "error") return inspectCodexError(item);
  if (completed && type === "agent_message") collectCodexCitations(item, cited);
  return {
    searches: completed && type === "web_search" ? codexSearchCount(item) : 0,
    policyError: false,
  };
}

function inspectCodexError(item: Record<string, unknown>): {
  searches: number;
  policyError: boolean;
} {
  return { searches: 0, policyError: /hook|bypass/i.test(String(item.message)) };
}

function collectCodexCitations(item: Record<string, unknown>, cited: Set<string>): void {
  if (typeof item.text !== "string") return;
  for (const url of extractedWebUrls(item.text)) cited.add(url);
}

function codexSearchCount(item: Record<string, unknown>): number {
  const action = record(item.action, "Codex Web Search action");
  if (action.type !== "search" || typeof item.query !== "string") return 0;
  return item.query.length > 0 ? 1 : 0;
}

export function inspectClaudeProbe(events: unknown[]): ClaudeInspection {
  const calls: string[] = [];
  const forbidden = new Set<string>();
  let initAccepted = false;
  let successfulResult = false;
  let authenticationFailed = false;
  let validSearches = 0;
  let searchResults = 0;
  let initEvents = 0;
  let resultEvents = 0;
  const toolIds = new Map<string, ClaudeToolCall>();

  for (const candidate of events) {
    try {
      const event = record(candidate, "Claude event");
      const eventType = typeof event.type === "string" ? event.type : "unknown";
      if (!claudeEventTypes.has(eventType)) forbidden.add(`event:${eventType}`);
      inspectNestedToolUses(event, forbidden);
      switch (event.type) {
        case "system":
          if (typeof event.subtype !== "string" || !claudeSystemSubtypes.has(event.subtype)) {
            forbidden.add(`system:${String(event.subtype)}`);
          }
          if (event.subtype === "init") {
            initEvents += 1;
            initAccepted = inspectClaudeInit(event) && (initEvents === 1 || initAccepted);
          }
          break;
        case "assistant":
          validSearches += collectClaudeCalls(event, calls, forbidden, toolIds);
          break;
        case "user":
          searchResults += collectClaudeResults(event, toolIds, forbidden);
          break;
        case "tool_progress":
          if (typeof event.tool_name !== "string" || !claudeAllowedTools.has(event.tool_name)) {
            forbidden.add(`tool_progress:${String(event.tool_name)}`);
          }
          break;
        case "result": {
          authenticationFailed ||= claudeAuthenticationFailed(event);
          const result = inspectClaudeResult(event);
          resultEvents += 1;
          authenticationFailed ||= result.authenticationFailed;
          successfulResult = result.successful && (resultEvents === 1 || successfulResult);
          break;
        }
        default:
          collectClaudeHook(event, forbidden);
      }
    } catch {
      forbidden.add("event:malformed");
    }
  }

  return {
    accepted: claudeAccepted(
      initAccepted,
      successfulResult,
      initEvents,
      resultEvents,
      validSearches,
      searchResults,
      forbidden,
    ),
    tool_calls: calls,
    forbidden_tool_calls: [...forbidden],
    authentication_failed: authenticationFailed,
  };
}

export function inspectLegacyClaudeProbe(events: unknown[]): ClaudeInspection {
  const calls: string[] = [];
  const forbidden = new Set<string>();
  let initAccepted = false;
  let successfulResult = false;
  let authenticationFailed = false;
  for (const candidate of events) {
    const event = record(candidate, "legacy Claude event");
    if (event.type === "system" && event.subtype === "init") {
      const tools = array(event.tools, "legacy Claude tools", true);
      initAccepted =
        tools.every((tool) => typeof tool === "string" && claudeAllowedTools.has(tool)) &&
        array(event.mcp_servers, "legacy Claude MCP servers", true).length === 0 &&
        array(event.skills, "legacy Claude skills", true).length === 0 &&
        array(event.plugins, "legacy Claude plugins", true).length === 0;
    }
    if (event.type === "assistant") {
      const message = record(event.message, "legacy Claude assistant message");
      for (const candidateContent of array(message.content, "legacy Claude content", true)) {
        const content = record(candidateContent, "legacy Claude content item");
        if (content.type !== "tool_use" || typeof content.name !== "string") continue;
        calls.push(content.name);
        if (!claudeAllowedTools.has(content.name)) forbidden.add(content.name);
      }
    }
    if (typeof event.type === "string" && event.type.startsWith("hook_")) {
      forbidden.add(event.type);
    }
    if (event.type === "result") {
      const result = typeof event.result === "string" ? event.result : "";
      authenticationFailed = /failed to authenticate|oauth session expired/i.test(result);
      successfulResult = event.is_error === false && !authenticationFailed;
    }
  }
  return {
    accepted: initAccepted && successfulResult && calls.length > 0 && forbidden.size === 0,
    tool_calls: calls,
    forbidden_tool_calls: [...forbidden],
    authentication_failed: authenticationFailed,
  };
}

function inspectClaudeResult(event: Record<string, unknown>): {
  authenticationFailed: boolean;
  successful: boolean;
} {
  const authenticationFailed = claudeAuthenticationFailed(event);
  const permissionDenials = array(event.permission_denials, "Claude permission denials", true);
  const subagentStats = record(event.subagent_stats, "Claude subagent stats");
  return {
    authenticationFailed,
    successful:
      event.subtype === "success" &&
      event.is_error === false &&
      event.terminal_reason === "completed" &&
      permissionDenials.length === 0 &&
      subagentStats.spawned === 0 &&
      !authenticationFailed,
  };
}

function claudeAuthenticationFailed(event: Record<string, unknown>): boolean {
  const result = typeof event.result === "string" ? event.result : "";
  return /failed to authenticate|oauth session expired/i.test(result);
}

function collectClaudeHook(event: Record<string, unknown>, forbidden: Set<string>): void {
  if (typeof event.type === "string" && event.type.startsWith("hook_")) forbidden.add(event.type);
}

function claudeAccepted(
  initAccepted: boolean,
  successfulResult: boolean,
  initEvents: number,
  resultEvents: number,
  validSearches: number,
  searchResults: number,
  forbidden: Set<string>,
): boolean {
  return (
    initAccepted &&
    successfulResult &&
    initEvents === 1 &&
    resultEvents === 1 &&
    validSearches > 0 &&
    searchResults > 0 &&
    forbidden.size === 0
  );
}

function inspectClaudeInit(event: Record<string, unknown>): boolean {
  const tools = array(event.tools, "Claude tools", true);
  return (
    typeof event.model === "string" &&
    event.model.length > 0 &&
    tools.every((tool) => typeof tool === "string" && claudeAllowedTools.has(tool)) &&
    array(event.mcp_servers, "Claude MCP servers", true).length === 0 &&
    array(event.skills, "Claude skills", true).length === 0 &&
    array(event.plugins, "Claude plugins", true).length === 0
  );
}

function collectClaudeCalls(
  event: Record<string, unknown>,
  calls: string[],
  forbidden: Set<string>,
  toolIds: Map<string, ClaudeToolCall>,
): number {
  const message = record(event.message, "Claude assistant message");
  let validSearches = 0;
  for (const candidate of array(message.content, "Claude content", true)) {
    const content = record(candidate, "Claude content item");
    if (typeof content.type !== "string" || !claudeAssistantContentTypes.has(content.type)) {
      forbidden.add(`assistant-content:${String(content.type)}`);
      continue;
    }
    if (content.type !== "tool_use") continue;
    if (typeof content.name !== "string") {
      forbidden.add("tool_use:missing-name");
      continue;
    }
    calls.push(content.name);
    if (!claudeAllowedTools.has(content.name)) forbidden.add(content.name);
    if (typeof content.id === "string" && content.id.length > 0) {
      if (toolIds.has(content.id)) forbidden.add(`tool_use:duplicate-id:${content.id}`);
      toolIds.set(content.id, {
        name: content.name,
        input: record(content.input, `Claude ${content.name} input`),
      });
    } else {
      forbidden.add(`${content.name}:missing-id`);
    }
    if (content.name !== "WebSearch") continue;
    const input = record(content.input, "Claude WebSearch input");
    if (typeof input.query === "string" && input.query.length > 0) {
      validSearches += 1;
    }
  }
  return validSearches;
}

function collectClaudeResults(
  event: Record<string, unknown>,
  toolIds: Map<string, ClaudeToolCall>,
  forbidden: Set<string>,
): number {
  const message = record(event.message, "Claude user message");
  const contents = array(message.content, "Claude user content", true);
  if (contents.length !== 1) forbidden.add("tool_result:ambiguous-message");
  let matchedCall: ClaudeToolCall | undefined;
  for (const [index, candidate] of contents.entries()) {
    const content = record(candidate, `Claude user content[${index}]`);
    if (content.type !== "tool_result") {
      forbidden.add(`user-content:${String(content.type)}`);
      continue;
    }
    const id = typeof content.tool_use_id === "string" ? content.tool_use_id : "";
    const call = toolIds.get(id);
    if (call === undefined) forbidden.add(`tool_result:uncorrelated:${id || "missing-id"}`);
    else matchedCall = call;
  }
  const resultValue = event.tool_use_result;
  if (typeof resultValue === "string") return 0;
  if (typeof resultValue !== "object" || resultValue === null) {
    forbidden.add("tool_result:missing-payload");
    return 0;
  }
  const result = record(resultValue, "Claude tool result");
  if ("query" in result || "results" in result) {
    if (matchedCall?.name !== "WebSearch") forbidden.add("WebSearch:mismatched-result");
    if (typeof result.query !== "string" || !Array.isArray(result.results)) {
      forbidden.add("WebSearch:malformed-result");
      return 0;
    }
    if (result.query !== matchedCall?.input.query) forbidden.add("WebSearch:query-mismatch");
    if (extractedWebUrls(JSON.stringify(result.results)).length === 0) {
      forbidden.add("WebSearch:empty-result");
      return 0;
    }
    return 1;
  }
  if ("url" in result || "result" in result) {
    if (matchedCall?.name !== "WebFetch") forbidden.add("WebFetch:mismatched-result");
    if (typeof result.url !== "string" || typeof result.result !== "string") {
      forbidden.add("WebFetch:malformed-result");
    } else if (result.url !== matchedCall?.input.url) {
      forbidden.add("WebFetch:url-mismatch");
    }
    return 0;
  }
  forbidden.add("tool_result:unknown-payload");
  return 0;
}

function inspectNestedToolUses(value: unknown, forbidden: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) inspectNestedToolUses(entry, forbidden);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const object = record(value, "Claude nested event value");
  if (typeof object.type === "string" && claudeForbiddenInvocationTypes.has(object.type)) {
    const name = typeof object.name === "string" ? object.name : "unknown";
    forbidden.add(`${object.type}:${name}`);
  }
  if (object.type === "server_tool_use") {
    const name = typeof object.name === "string" ? object.name : "unknown";
    forbidden.add(`server_tool_use:${name}`);
  }
  if (object.type === "tool_progress") {
    const tool = typeof object.tool_name === "string" ? object.tool_name : "unknown";
    if (!claudeAllowedTools.has(tool)) forbidden.add(`tool_progress:${tool}`);
  }
  if (object.type === "tool_use") {
    if (typeof object.name !== "string") forbidden.add("tool_use:missing-name");
    else if (!claudeAllowedTools.has(object.name)) forbidden.add(object.name);
  }
  for (const entry of Object.values(object)) inspectNestedToolUses(entry, forbidden);
}
