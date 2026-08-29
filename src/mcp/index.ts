import type {
  CallContextFactory,
  InvestigationApplication,
  ToolResult,
  WebOpenInput,
  WebSearchInput,
} from "@/features/investigation";

export interface McpToolAdapter {
  webSearch(input: WebSearchInput, signal?: AbortSignal): Promise<ToolResult>;
  webOpen(input: WebOpenInput, signal?: AbortSignal): Promise<ToolResult>;
}

export interface McpToolDependencies {
  readonly application: InvestigationApplication;
  readonly calls: CallContextFactory;
}
