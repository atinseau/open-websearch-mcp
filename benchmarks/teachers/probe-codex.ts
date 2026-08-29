import { extractedWebUrls, record } from "./contract-json.ts";
import {
  codexEventTypes,
  codexForbiddenTypes,
  codexItemTypes,
  type CodexInspection,
} from "./probe-shared.ts";

type CodexProbeState = {
  forbidden: Set<string>;
  cited: Set<string>;
  searches: number;
  completed: number;
  policyError: boolean;
};

function createCodexProbeState(): CodexProbeState {
  return {
    forbidden: new Set<string>(),
    cited: new Set<string>(),
    searches: 0,
    completed: 0,
    policyError: false,
  };
}

function collectCodexEvent(event: Record<string, unknown>, state: CodexProbeState): void {
  inspectNestedCodexItems(event, state.forbidden);
  const eventType = typeof event.type === "string" ? event.type : "unknown";
  if (!codexEventTypes.has(eventType)) state.forbidden.add(`event:${eventType}`);
  if (eventType === "error") state.policyError ||= /hook|bypass/i.test(String(event.message));
  if (eventType === "turn.completed") state.completed += 1;
  if (eventType === "item.completed" || eventType === "item.started")
    collectCodexItemEvent(event, eventType, state);
}

function collectCodexItemEvent(
  event: Record<string, unknown>,
  eventType: string,
  state: CodexProbeState,
): void {
  const result = inspectCodexItem(
    record(event.item, "Codex item"),
    state.forbidden,
    state.cited,
    eventType === "item.completed",
  );
  state.searches += result.searches;
  state.policyError ||= result.policyError;
}

export function inspectCodexProbe(events: unknown[]): CodexInspection {
  const state = createCodexProbeState();
  for (const candidate of events) {
    try {
      const event = record(candidate, "Codex event");
      collectCodexEvent(event, state);
    } catch {
      state.forbidden.add("event:malformed");
    }
  }
  return {
    accepted:
      state.completed === 1 &&
      state.searches > 0 &&
      state.cited.size > 0 &&
      state.forbidden.size === 0 &&
      !state.policyError,
    searches: state.searches,
    forbidden_tool_calls: [...state.forbidden],
    cited_urls: [...state.cited],
  };
}

type LegacyCodexProbeState = Omit<CodexProbeState, "completed"> & { completed: boolean };

function createLegacyCodexProbeState(): LegacyCodexProbeState {
  return {
    forbidden: new Set<string>(),
    cited: new Set<string>(),
    searches: 0,
    completed: false,
    policyError: false,
  };
}

const legacyForbiddenTypes = new Set([
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "collab_tool_call",
]);

function collectLegacyCodexEvent(
  event: Record<string, unknown>,
  state: LegacyCodexProbeState,
): void {
  if (event.type === "turn.completed") state.completed = true;
  if (event.type === "item.completed")
    collectLegacyCodexItem(record(event.item, "legacy Codex item"), state);
}

function collectLegacyCodexItem(item: Record<string, unknown>, state: LegacyCodexProbeState): void {
  const type = typeof item.type === "string" ? item.type : "unknown";
  if (legacyForbiddenTypes.has(type)) state.forbidden.add(type);
  if (type === "error") state.policyError ||= /hook|bypass/i.test(String(item.message));
  if (type === "web_search") state.searches += codexSearchCount(item);
  if (type === "agent_message") collectCodexCitations(item, state.cited);
}

export function inspectLegacyCodexProbe(events: unknown[]): CodexInspection {
  const state = createLegacyCodexProbeState();
  for (const candidate of events) {
    const event = record(candidate, "legacy Codex event");
    collectLegacyCodexEvent(event, state);
  }
  return {
    accepted:
      state.completed &&
      state.searches > 0 &&
      state.cited.size > 0 &&
      state.forbidden.size === 0 &&
      !state.policyError,
    searches: state.searches,
    forbidden_tool_calls: [...state.forbidden],
    cited_urls: [...state.cited],
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
