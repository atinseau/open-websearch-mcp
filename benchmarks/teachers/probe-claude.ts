import { array, extractedWebUrls, record } from "./contract-json.ts";
import {
  claudeAllowedTools,
  claudeAssistantContentTypes,
  claudeEventTypes,
  claudeSystemSubtypes,
  type ClaudeInspection,
  type ClaudeProbeState,
  type ClaudeToolCall,
} from "./probe-shared.ts";
import { claudeAuthenticationFailed, collectClaudeHook } from "./probe-claude-events.ts";
export { inspectLegacyClaudeProbe } from "./probe-claude-legacy.ts";
import { inspectNestedToolUses } from "./probe-claude-forbidden.ts";

function createClaudeProbeState(): ClaudeProbeState {
  return {
    calls: [],
    forbidden: new Set<string>(),
    toolIds: new Map<string, ClaudeToolCall>(),
    initAccepted: false,
    successfulResult: false,
    authenticationFailed: false,
    validSearches: 0,
    searchResults: 0,
    initEvents: 0,
    resultEvents: 0,
  };
}

function collectClaudeSystem(event: Record<string, unknown>, state: ClaudeProbeState): void {
  if (typeof event.subtype !== "string" || !claudeSystemSubtypes.has(event.subtype)) {
    state.forbidden.add(`system:${String(event.subtype)}`);
  }
  if (event.subtype !== "init") return;
  state.initEvents += 1;
  state.initAccepted = inspectClaudeInit(event) && (state.initEvents === 1 || state.initAccepted);
}

function collectClaudeToolProgress(event: Record<string, unknown>, state: ClaudeProbeState): void {
  if (typeof event.tool_name !== "string" || !claudeAllowedTools.has(event.tool_name)) {
    state.forbidden.add(`tool_progress:${String(event.tool_name)}`);
  }
}

function collectClaudeResultEvent(event: Record<string, unknown>, state: ClaudeProbeState): void {
  state.authenticationFailed ||= claudeAuthenticationFailed(event);
  const result = inspectClaudeResult(event);
  state.resultEvents += 1;
  state.authenticationFailed ||= result.authenticationFailed;
  state.successfulResult =
    result.successful && (state.resultEvents === 1 || state.successfulResult);
}

/** Dispatches one event to its collector; unknown types fall through to hooks. */
function collectClaudeEvent(event: Record<string, unknown>, state: ClaudeProbeState): void {
  switch (event.type) {
    case "system":
      collectClaudeSystem(event, state);
      return;
    case "assistant":
      state.validSearches += collectClaudeCalls(event, state.calls, state.forbidden, state.toolIds);
      return;
    case "user":
      state.searchResults += collectClaudeResults(event, state.toolIds, state.forbidden);
      return;
    case "tool_progress":
      collectClaudeToolProgress(event, state);
      return;
    case "result":
      collectClaudeResultEvent(event, state);
      return;
    default:
      collectClaudeHook(event, state.forbidden);
  }
}

export function inspectClaudeProbe(events: unknown[]): ClaudeInspection {
  const state = createClaudeProbeState();
  const { calls, forbidden } = state;

  for (const candidate of events) {
    try {
      const event = record(candidate, "Claude event");
      const eventType = typeof event.type === "string" ? event.type : "unknown";
      if (!claudeEventTypes.has(eventType)) forbidden.add(`event:${eventType}`);
      inspectNestedToolUses(event, forbidden);
      collectClaudeEvent(event, state);
    } catch {
      forbidden.add("event:malformed");
    }
  }

  const { authenticationFailed } = state;
  return {
    accepted: claudeAccepted(state),
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

/** A probe is accepted only on exactly one clean init and result with real searches. */
function claudeAccepted(state: ClaudeProbeState): boolean {
  return (
    state.initAccepted &&
    state.successfulResult &&
    state.initEvents === 1 &&
    state.resultEvents === 1 &&
    state.validSearches > 0 &&
    state.searchResults > 0 &&
    state.forbidden.size === 0
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
    validSearches += collectClaudeContent(content, calls, forbidden, toolIds);
  }
  return validSearches;
}

function collectClaudeContent(
  content: Record<string, unknown>,
  calls: string[],
  forbidden: Set<string>,
  toolIds: Map<string, ClaudeToolCall>,
): number {
  if (typeof content.type !== "string" || !claudeAssistantContentTypes.has(content.type)) {
    forbidden.add(`assistant-content:${String(content.type)}`);
    return 0;
  }
  if (content.type !== "tool_use") return 0;
  return collectClaudeToolUse(content, calls, forbidden, toolIds);
}

function collectClaudeToolUse(
  content: Record<string, unknown>,
  calls: string[],
  forbidden: Set<string>,
  toolIds: Map<string, ClaudeToolCall>,
): number {
  if (typeof content.name !== "string") {
    forbidden.add("tool_use:missing-name");
    return 0;
  }
  calls.push(content.name);
  if (!claudeAllowedTools.has(content.name)) forbidden.add(content.name);
  collectClaudeToolId(content, content.name, toolIds, forbidden);
  return validClaudeSearch(content);
}

function collectClaudeToolId(
  content: Record<string, unknown>,
  name: string,
  toolIds: Map<string, ClaudeToolCall>,
  forbidden: Set<string>,
): void {
  if (typeof content.id !== "string" || content.id.length === 0) {
    forbidden.add(`${name}:missing-id`);
    return;
  }
  if (toolIds.has(content.id)) forbidden.add(`tool_use:duplicate-id:${content.id}`);
  toolIds.set(content.id, {
    name,
    input: record(content.input, `Claude ${name} input`),
  });
}

function validClaudeSearch(content: Record<string, unknown>): number {
  if (content.name !== "WebSearch") return 0;
  const input = record(content.input, "Claude WebSearch input");
  if (typeof input.query !== "string" || input.query.length === 0) return 0;
  return 1;
}

function collectClaudeResults(
  event: Record<string, unknown>,
  toolIds: Map<string, ClaudeToolCall>,
  forbidden: Set<string>,
): number {
  const matchedCall = correlateToolResult(event, toolIds, forbidden);
  const resultValue = event.tool_use_result;
  if (typeof resultValue === "string") return 0;
  if (typeof resultValue !== "object" || resultValue === null) {
    forbidden.add("tool_result:missing-payload");
    return 0;
  }
  const result = record(resultValue, "Claude tool result");
  if ("query" in result || "results" in result) {
    return validateSearchResult(result, matchedCall, forbidden);
  }
  if ("url" in result || "result" in result) {
    validateFetchResult(result, matchedCall, forbidden);
    return 0;
  }
  forbidden.add("tool_result:unknown-payload");
  return 0;
}

/** Ties a tool result back to the call that produced it. */
function correlateToolResult(
  event: Record<string, unknown>,
  toolIds: Map<string, ClaudeToolCall>,
  forbidden: Set<string>,
): ClaudeToolCall | undefined {
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
  return matchedCall;
}

/** Returns 1 when the payload is a well-formed, non-empty WebSearch result. */
function validateSearchResult(
  result: Record<string, unknown>,
  matchedCall: ClaudeToolCall | undefined,
  forbidden: Set<string>,
): number {
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

function validateFetchResult(
  result: Record<string, unknown>,
  matchedCall: ClaudeToolCall | undefined,
  forbidden: Set<string>,
): void {
  if (matchedCall?.name !== "WebFetch") forbidden.add("WebFetch:mismatched-result");
  if (typeof result.url !== "string" || typeof result.result !== "string") {
    forbidden.add("WebFetch:malformed-result");
  } else if (result.url !== matchedCall?.input.url) {
    forbidden.add("WebFetch:url-mismatch");
  }
}
