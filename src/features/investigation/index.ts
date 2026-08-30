import type { ConfigurationSnapshot } from "@/features/configuration";

export {
  createInvestigationService,
  type ExplorationResult,
  type InvestigationService,
  type PageExploration,
} from "./application/investigations.ts";
export type { ConsumptionResult, Investigation, InvestigationId } from "./domain/investigation.ts";
export {
  createWebResearchApplication,
  type WebResearchDependencies,
} from "./application/web-research.ts";

import type { InvestigationId } from "./domain/investigation.ts";

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
  readonly maxResults?: number;
  readonly profile?: SearchProfile;
  readonly locale?: string;
}

export interface WebOpenInput {
  readonly url: URL;
  readonly investigationId?: InvestigationId;
  readonly focus?: string;
  readonly maxChars?: number;
}

export type SearchProfile = "auto" | "general" | "technical" | "news" | "academic" | "community";
export type ToolStatus = "success" | "partial" | "no_relevant_results" | "blocked" | "error";
export type ToolReason =
  | "renderer_unavailable"
  | "authentication_required"
  | "consent_required"
  | "paywall"
  | "captcha"
  | "waf"
  | "unsupported_format"
  | "unsupported_or_ocr_required"
  | "timeout"
  | "network_error"
  | "internal_error";
export type Confidence = "high" | "medium" | "low";

export interface StructuredToolResult {
  readonly investigation_id: InvestigationId;
  readonly status: ToolStatus;
  readonly reason?: ToolReason;
  readonly confidence: Confidence;
  readonly results: readonly EvidenceResult[];
  readonly suggested_queries?: readonly SuggestedQuery[];
  /**
   * The keyword query discovery derived after a thin first pass. Reported so
   * the second search is visible to the agent rather than silent (SEARCH-001).
   */
  readonly follow_up_query?: string;
}

export interface EvidenceResult {
  readonly title: string;
  readonly url: string;
  readonly final_url: string;
  readonly discovery: "google" | "local_cache" | "direct_open";
  readonly source_type: string;
  readonly mime_type: string;
  readonly published_at?: string;
  readonly fetched_at: string;
  readonly score: number;
  readonly trust: "external_untrusted";
  readonly passages: readonly {
    readonly text: string;
    readonly score: number;
    readonly heading?: string;
    readonly fragment?: string;
    readonly document_page?: number;
    readonly passage_hash: string;
  }[];
  readonly code_blocks: readonly EvidenceCodeBlock[];
  readonly content_links: readonly ContentLink[];
  readonly navigation_links: readonly NavigationLink[];
  readonly content_hash: string;
}

export interface EvidenceCodeBlock {
  readonly text: string;
  readonly language?: string;
  readonly trust: "external_untrusted";
  readonly invisible_character_warnings: readonly string[];
  readonly heading?: string;
  readonly fragment?: string;
  readonly document_page?: number;
  readonly content_hash: string;
}

export interface ContentLink {
  readonly title: string;
  readonly url: string;
  readonly context?: string;
}
export interface NavigationLink {
  readonly title: string;
  readonly url: string;
}
export interface SuggestedQuery {
  readonly query: string;
  readonly source: "google_related" | "google_question";
}

/** The portable result shape shared by textual and structured MCP content. */
export interface ToolResult {
  readonly investigationId: InvestigationId;
  readonly text?: string;
  readonly structuredContent: Record<string, unknown>;
}
