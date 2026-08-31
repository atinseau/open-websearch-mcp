import { extractDocument } from "@/features/extraction/application/extract-document";
import { identifyMime } from "@/features/extraction/domain/mime";
import type { RenderedLink } from "@/features/rendering";

export type ExtractionStatus = "success" | "unsupported" | "unsupported_or_ocr_required";
export type ExtractorName =
  | "obscura-native-markdown"
  | "plain-text"
  | "markdown"
  | "json"
  | "xml"
  | "github-raw-code"
  | "textual-pdf";

/** A bounded source-located portion of external untrusted content. */
export interface EvidencePassage {
  readonly text: string;
  readonly sourceUrl: URL;
  readonly trust: "external_untrusted";
  readonly score: number;
  readonly heading?: string;
  readonly headingPath?: readonly string[];
  readonly fragment?: string;
  readonly documentPage?: number;
  readonly passageHash: string;
}

export interface EvidenceCodeBlock {
  readonly text: string;
  readonly language?: string;
  readonly trust: "external_untrusted";
  readonly invisibleCharacterWarnings: readonly string[];
  readonly heading?: string;
  readonly fragment?: string;
  readonly documentPage?: number;
  readonly contentHash: string;
}

export interface ExtractedLink {
  readonly title: string;
  readonly url: URL;
  readonly context?: string;
}

export interface MediaMetadata {
  readonly kind: "image" | "audio" | "video";
  readonly byteLength: number;
}

export interface ExtractionResult {
  readonly status: ExtractionStatus;
  readonly mimeType: string;
  readonly extractor?: { readonly name: ExtractorName; readonly version: string };
  readonly passages: readonly EvidencePassage[];
  readonly codeBlocks: readonly EvidenceCodeBlock[];
  readonly contentLinks: readonly ExtractedLink[];
  readonly navigationLinks: readonly ExtractedLink[];
  readonly media?: MediaMetadata;
}

export interface ExtractionInput {
  readonly documentUrl: URL;
  readonly renderedText: string;
  readonly markdown?: string;
  readonly body?: string | Uint8Array;
  readonly headers?: Headers;
  readonly links?: readonly RenderedLink[];
  readonly focus?: string;
  readonly maxChars?: number;
  /**
   * How many passages this extraction may return. CONFIG-004 makes the output
   * limits configurable, and `[output].search_passages_per_source` is the
   * value a search supplies; omitted falls back to the built-in default.
   */
  readonly maxPassages?: number;
  readonly documentPage?: number;
}

/** The deterministic registry is the only public extraction capability. */
export interface ExtractorRegistry {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/** Identifies a document from response headers plus at most 512 sniffed bytes. */
export { identifyMime };

export function createExtractorRegistry(): ExtractorRegistry {
  return { extract: extractDocument };
}
