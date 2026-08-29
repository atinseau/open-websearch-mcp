import type { Candidate, GoogleDiscoveryResult } from "@/features/discovery";
import type { ExtractionResult } from "@/features/extraction";
import type { RenderedDocument } from "@/features/rendering";
import type {
  Confidence,
  EvidenceResult,
  StructuredToolResult,
  ToolReason,
  ToolResult,
  WebSearchInput,
} from "../index.ts";

export function extractionInput(document: RenderedDocument, focus?: string, maxChars?: number) {
  return {
    documentUrl: document.url,
    renderedText: document.text,
    markdown: document.markdown,
    links: document.links,
    // Trust what the origin declared. Forcing `text/html` sent PDFs and other
    // binaries down the HTML path, so their raw bytes became page evidence.
    headers: new Headers({ "content-type": document.contentType ?? "text/html" }),
    focus,
    maxChars,
  };
}
export function pageResult(input: {
  readonly document: RenderedDocument;
  readonly extracted: ExtractionResult;
  readonly discovery: EvidenceResult["discovery"];
  readonly sourceType: string;
  readonly score: number;
  readonly now: Date;
}): EvidenceResult {
  const { document, extracted, discovery, sourceType, score, now } = input;
  const contentHash = new Bun.CryptoHasher("sha256")
    .update(extracted.passages.map((p) => p.text).join("\n"))
    .digest("hex");
  return {
    title: document.diagnostics.title,
    url: document.url.href,
    final_url: document.url.href,
    discovery,
    source_type: sourceType,
    mime_type: extracted.mimeType,
    fetched_at: now.toISOString(),
    score,
    trust: "external_untrusted",
    passages: extracted.passages.map((p) => ({
      text: p.text,
      score: p.score,
      heading: p.heading,
      fragment: p.fragment,
      document_page: p.documentPage,
      passage_hash: p.passageHash,
    })),
    code_blocks: extracted.codeBlocks.map((b) => ({
      text: b.text,
      language: b.language,
      trust: b.trust,
      invisible_character_warnings: b.invisibleCharacterWarnings,
      heading: b.heading,
      fragment: b.fragment,
      document_page: b.documentPage,
      content_hash: b.contentHash,
    })),
    content_links: extracted.contentLinks.map((l) => ({
      title: l.title,
      url: l.url.href,
      context: l.context,
    })),
    navigation_links: extracted.navigationLinks.map((l) => ({ title: l.title, url: l.url.href })),
    content_hash: contentHash,
  };
}
export function success(results: readonly EvidenceResult[]): StructuredToolResult {
  return { investigation_id: "", status: "success", confidence: "high", results };
}
export function empty(
  status: StructuredToolResult["status"],
  confidence: Confidence,
  reason?: ToolReason,
): StructuredToolResult {
  return { investigation_id: "", status, ...(reason ? { reason } : {}), confidence, results: [] };
}
export function tool(investigationId: string, value: StructuredToolResult): ToolResult {
  return { investigationId, structuredContent: { ...value, investigation_id: investigationId } };
}
export function reasonForExtraction(value: ExtractionResult): ToolReason {
  return value.status === "unsupported_or_ocr_required"
    ? "unsupported_or_ocr_required"
    : "unsupported_format";
}
export function reasonForDiscovery(reason: string | undefined): ToolReason {
  if (reason?.includes("renderer_unavailable")) return "renderer_unavailable";
  if (reason?.includes("captcha")) return "captcha";
  if (reason?.includes("waf")) return "waf";
  if (reason?.includes("timeout")) return "timeout";
  return "network_error";
}
export function reasonForRuntimeFailure(error: unknown): ToolReason {
  if (error instanceof ExpectedFailure) return error.reason;
  return error instanceof Error && error.message.includes("renderer_unavailable")
    ? "renderer_unavailable"
    : "network_error";
}
export function discoveryFailure(
  status: string,
  reason: string | undefined,
): StructuredToolResult | undefined {
  if (status === "blocked") return empty("blocked", "low", reasonForDiscovery(reason));
  return status === "error" || status === "parse_failure"
    ? empty("error", "low", reasonForDiscovery(reason))
    : undefined;
}
export function searchResponse(
  investigationId: string,
  results: readonly EvidenceResult[],
  input: WebSearchInput,
  discovered: GoogleDiscoveryResult,
): StructuredToolResult {
  const wanted = input.maxResults ?? 5;
  const status =
    results.length === 0 ? "no_relevant_results" : results.length < wanted ? "partial" : "success";
  const confidence =
    status === "success"
      ? "high"
      : results.some((result) => result.score >= 0.4)
        ? "medium"
        : "low";
  return {
    investigation_id: investigationId,
    status,
    confidence,
    results,
    suggested_queries: discovered.suggestedQueries,
  };
}
export class ExpectedFailure extends Error {
  constructor(readonly reason: ToolReason) {
    super(reason);
  }
}
export function cacheRead(now: Date) {
  return {
    now,
    ttls: {
      newsTtlSeconds: 900,
      generalTtlSeconds: 86_400,
      docsTtlSeconds: 604_800,
      versionedTtlSeconds: 2_592_000,
    },
  };
}
export function cachedPrepared(candidate: Candidate, markdown: string) {
  const document = {
    url: candidate.url,
    text: markdown,
    markdown,
    links: [],
    diagnostics: {
      title: candidate.title ?? candidate.url.hostname,
      transferBytes: 0,
      settledMs: 0,
    },
  };
  const extracted = {
    status: "success" as const,
    mimeType: "text/html",
    passages: [
      {
        text: markdown,
        sourceUrl: candidate.url,
        trust: "external_untrusted" as const,
        score: 1,
        passageHash: new Bun.CryptoHasher("sha256").update(markdown).digest("hex"),
      },
    ],
    codeBlocks: [],
    contentLinks: [],
    navigationLinks: [],
  };
  return { candidate, document, extracted };
}
