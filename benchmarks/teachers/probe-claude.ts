import { array, extractedWebUrls, record } from "./contract-json.ts";
import {
  claudeAllowedTools,
  claudeAssistantContentTypes,
  claudeEventTypes,
  claudeForbiddenInvocationTypes,
  claudeSystemSubtypes,
  type ClaudeInspection,
  type ClaudeToolCall,
} from "./probe-shared.ts";

/** Mutable tallies accumulated while walking one Claude event stream. */
type ClaudeProbeState = {
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
    accepted: claudeAccepted(
      state.initAccepted,
      state.successfulResult,
      state.initEvents,
      state.resultEvents,
      state.validSearches,
      state.searchResults,
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
