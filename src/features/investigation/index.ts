import type { ConfigurationSnapshot } from "@/features/configuration";

/** Stable identity for one isolated persistent search journey. */
export type InvestigationId = string;

/** Context created once per MCP call and retained for its complete lifetime. */
export interface CallContext {
  readonly abortController: AbortController;
  readonly configuration: ConfigurationSnapshot;
}

/** Creates a call context with an immutable configuration snapshot. */
export interface CallContextFactory {
  create(): CallContext;
}

/** Application seam consumed by the thin MCP adapter. */
export interface InvestigationApplication {
  webSearch(input: WebSearchInput, context: CallContext): Promise<ToolResult>;
  webOpen(input: WebOpenInput, context: CallContext): Promise<ToolResult>;
}

export interface WebSearchInput {
  readonly query: string;
  readonly investigationId?: InvestigationId;
}

export interface WebOpenInput {
  readonly url: URL;
  readonly investigationId?: InvestigationId;
}

/** The portable result shape shared by textual and structured MCP content. */
export interface ToolResult {
  readonly investigationId: InvestigationId;
  readonly text: string;
  readonly structuredContent: Record<string, unknown>;
}
