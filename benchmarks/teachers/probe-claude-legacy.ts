import { array, record } from "./contract-json.ts";
import {
  claudeAllowedTools,
  type ClaudeInspection,
  type ClaudeProbeState,
} from "./probe-shared.ts";
import { claudeAuthenticationFailed, collectClaudeHook } from "./probe-claude-events.ts";

export function inspectLegacyClaudeProbe(events: unknown[]): ClaudeInspection {
  const state = createLegacyClaudeState();
  for (const candidate of events) {
    const event = record(candidate, "legacy Claude event");
    collectLegacyClaudeEvent(event, state);
  }
  return {
    accepted: legacyClaudeAccepted(state),
    tool_calls: state.calls,
    forbidden_tool_calls: [...state.forbidden],
    authentication_failed: state.authenticationFailed,
  };
}

type LegacyClaudeState = Pick<
  ClaudeProbeState,
  "calls" | "forbidden" | "initAccepted" | "successfulResult" | "authenticationFailed"
>;

function createLegacyClaudeState(): LegacyClaudeState {
  return {
    calls: [],
    forbidden: new Set<string>(),
    initAccepted: false,
    successfulResult: false,
    authenticationFailed: false,
  };
}

function collectLegacyClaudeEvent(event: Record<string, unknown>, state: LegacyClaudeState): void {
  if (event.type === "system" && event.subtype === "init")
    state.initAccepted = legacyInitAccepted(event);
  if (event.type === "assistant") collectLegacyCalls(event, state.calls, state.forbidden);
  collectClaudeHook(event, state.forbidden);
  if (event.type === "result") collectLegacyClaudeResult(event, state);
}

function collectLegacyClaudeResult(event: Record<string, unknown>, state: LegacyClaudeState): void {
  state.authenticationFailed = claudeAuthenticationFailed(event);
  state.successfulResult = event.is_error === false && !state.authenticationFailed;
}

function legacyClaudeAccepted(state: LegacyClaudeState): boolean {
  return (
    state.initAccepted &&
    state.successfulResult &&
    state.calls.length > 0 &&
    state.forbidden.size === 0
  );
}

/** The sealed refresh proved isolation through its init event alone. */
function legacyInitAccepted(event: Record<string, unknown>): boolean {
  const tools = array(event.tools, "legacy Claude tools", true);
  return (
    tools.every((tool) => typeof tool === "string" && claudeAllowedTools.has(tool)) &&
    array(event.mcp_servers, "legacy Claude MCP servers", true).length === 0 &&
    array(event.skills, "legacy Claude skills", true).length === 0 &&
    array(event.plugins, "legacy Claude plugins", true).length === 0
  );
}

function collectLegacyCalls(
  event: Record<string, unknown>,
  calls: string[],
  forbidden: Set<string>,
): void {
  const message = record(event.message, "legacy Claude assistant message");
  for (const candidateContent of array(message.content, "legacy Claude content", true)) {
    const content = record(candidateContent, "legacy Claude content item");
    if (content.type !== "tool_use" || typeof content.name !== "string") continue;
    calls.push(content.name);
    if (!claudeAllowedTools.has(content.name)) forbidden.add(content.name);
  }
}
