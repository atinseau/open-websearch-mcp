import { array, extractedWebUrls, record, type JsonRecord } from "./contract-json.ts";

type ToolResult = { tool: string; summary: string };
type Source = { url: string; title: string };
type Passage = { url: string; text: string };
type NormalizedRun = {
  model: string;
  queries: string[];
  tool_results: ToolResult[];
  opened_urls: string[];
  cited_urls: string[];
  selected_sources: Source[];
  evidence_passages: Passage[];
  final_answer: string;
};
type NormalizationState = {
  model: string;
  queries: Set<string>;
  toolResults: ToolResult[];
  openedUrls: Set<string>;
  sourceTitles: Map<string, string>;
  sources: Map<string, string>;
  passages: Passage[];
  finalAnswer: string;
};

export function normalizeTeacherRun(
  provider: "codex" | "claude",
  events: unknown[],
  explicitModel?: string,
): NormalizedRun {
  const state = createState(explicitModel);
  for (const candidate of events) {
    const event = record(candidate, `${provider} event`);
    if (provider === "codex") collectCodexEvent(event, state);
    else collectClaudeEvent(event, state);
  }
  return finishNormalization(state);
}

function createState(explicitModel?: string): NormalizationState {
  return {
    model: explicitModel ?? "unknown",
    queries: new Set(),
    toolResults: [],
    openedUrls: new Set(),
    sourceTitles: new Map(),
    sources: new Map(),
    passages: [],
    finalAnswer: "",
  };
}

function collectCodexEvent(event: JsonRecord, state: NormalizationState): void {
  if (event.type !== "item.completed") return;
  const item = record(event.item, "Codex item");
  if (item.type === "agent_message") collectCodexAnswer(item, state);
  if (item.type === "web_search") collectCodexWebAction(item, state);
}

function collectCodexAnswer(item: JsonRecord, state: NormalizationState): void {
  if (typeof item.text === "string") state.finalAnswer = item.text;
}

function collectCodexWebAction(item: JsonRecord, state: NormalizationState): void {
  const action = record(item.action, "Codex Web Search action");
  if (action.type === "search") collectCodexQuery(item, state);
  else collectCodexOpenedUrls(item, state);
  if (typeof action.url === "string") state.openedUrls.add(action.url);
  state.toolResults.push({
    tool: "web_search",
    summary: "Codex exec JSONL exposes the search action but not its result payload.",
  });
}

function collectCodexQuery(item: JsonRecord, state: NormalizationState): void {
  if (typeof item.query === "string" && item.query.length > 0) state.queries.add(item.query);
}

function collectCodexOpenedUrls(item: JsonRecord, state: NormalizationState): void {
  if (typeof item.query !== "string") return;
  for (const url of extractedWebUrls(item.query)) state.openedUrls.add(url);
}

function collectClaudeEvent(event: JsonRecord, state: NormalizationState): void {
  if (event.type === "system" && event.subtype === "init" && typeof event.model === "string") {
    state.model = event.model;
  }
  if (event.type === "assistant") collectClaudeAssistant(event, state);
  if (event.type === "user" && event.tool_use_result !== undefined) {
    collectClaudeToolResult(event.tool_use_result, state);
  }
  if (event.type === "result" && typeof event.result === "string") {
    state.finalAnswer = event.result;
  }
}

function collectClaudeAssistant(event: JsonRecord, state: NormalizationState): void {
  const message = record(event.message, "Claude assistant message");
  for (const candidate of array(message.content, "Claude content", true)) {
    const content = record(candidate, "Claude content item");
    if (content.type !== "tool_use") continue;
    const input = record(content.input, "Claude tool input");
    if (content.name === "WebSearch" && typeof input.query === "string")
      state.queries.add(input.query);
    if (content.name === "WebFetch" && typeof input.url === "string")
      state.openedUrls.add(input.url);
  }
}

function collectClaudeToolResult(value: unknown, state: NormalizationState): void {
  if (typeof value === "string") {
    state.toolResults.push({ tool: "Web", summary: value.slice(0, 500) });
    return;
  }
  if (Array.isArray(value)) {
    collectSources(value, state);
    return;
  }
  const result = record(value, "Claude tool result");
  if (typeof result.query === "string") state.queries.add(result.query);
  if (Array.isArray(result.results)) collectSources(result.results, state);
  if (typeof result.url !== "string") return;
  state.openedUrls.add(result.url);
  const text = typeof result.result === "string" ? result.result : "Web page opened.";
  state.toolResults.push({ tool: "WebFetch", summary: text.slice(0, 500) });
  state.passages.push({ url: result.url, text });
  state.sources.set(result.url, result.url);
}

function collectSources(value: unknown, state: NormalizationState): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceItem(item, state);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const candidate = record(value, "Claude source result");
  if (collectSourceRecord(candidate, state)) return;
  for (const child of Object.values(candidate)) collectNestedSource(child, state);
}

function collectSourceItem(item: unknown, state: NormalizationState): void {
  if (typeof item === "string") {
    if (item.length > 0) state.toolResults.push({ tool: "WebSearch", summary: item.slice(0, 500) });
    return;
  }
  collectSources(item, state);
}

function collectSourceRecord(candidate: JsonRecord, state: NormalizationState): boolean {
  if (typeof candidate.url !== "string") return false;
  const title = typeof candidate.title === "string" ? candidate.title : candidate.url;
  state.sourceTitles.set(candidate.url, title);
  state.toolResults.push({ tool: "WebSearch", summary: `${title}: ${candidate.url}` });
  return true;
}

function collectNestedSource(value: unknown, state: NormalizationState): void {
  if (typeof value === "object" && value !== null) collectSources(value, state);
}

function finishNormalization(state: NormalizationState): NormalizedRun {
  const citedUrls = extractedWebUrls(state.finalAnswer);
  for (const openedUrl of state.openedUrls) {
    if (!state.sources.has(openedUrl)) {
      state.sources.set(openedUrl, state.sourceTitles.get(openedUrl) ?? openedUrl);
    }
  }
  for (const citedUrl of citedUrls) {
    if (!state.sources.has(citedUrl)) {
      state.sources.set(citedUrl, state.sourceTitles.get(citedUrl) ?? citedUrl);
    }
  }
  return {
    model: state.model,
    queries: [...state.queries],
    tool_results: state.toolResults,
    opened_urls: [...state.openedUrls],
    cited_urls: citedUrls,
    selected_sources: [...state.sources].map(([url, title]) => ({ url, title })),
    evidence_passages: state.passages,
    final_answer: state.finalAnswer,
  };
}
