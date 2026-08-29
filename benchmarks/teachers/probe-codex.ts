import { array, extractedWebUrls, record } from "./contract-json.ts";
import {
  claudeAllowedTools,
  claudeAssistantContentTypes,
  claudeEventTypes,
  claudeForbiddenInvocationTypes,
  claudeSystemSubtypes,
  codexEventTypes,
  codexForbiddenTypes,
  codexItemTypes,
  type ClaudeInspection,
  type ClaudeToolCall,
  type CodexInspection,
} from "./probe-shared.ts";

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
