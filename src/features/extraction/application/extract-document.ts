import type {
  EvidenceCodeBlock,
  EvidencePassage,
  ExtractionInput,
  ExtractionResult,
  ExtractorName,
} from "@/features/extraction";
import { extractLinks } from "@/features/extraction/domain/links";
import { markdownBlocks, type ContentBlock } from "@/features/extraction/domain/markdown";
import { identifyMime, isRawGitHub } from "@/features/extraction/domain/mime";
import { extractPdfText } from "@/features/extraction/domain/pdf";
import { codeWarnings, safeText } from "@/features/extraction/domain/safe-content";

const VERSION = "1";
const DEFAULT_PASSAGES = 2;
const PASSAGE_SIZE = 1_200;

export async function extractDocument(input: ExtractionInput): Promise<ExtractionResult> {
  const mimeType = identifyMime(input);
  const media = mediaKind(mimeType);
  if (media)
    return empty(mimeType, "unsupported", { kind: media, byteLength: byteLength(input.body) });
  if (mimeType === "application/pdf") return extractPdf(input, mimeType);
  const extractor = extractorFor(mimeType, input.documentUrl);
  if (!extractor) return empty(mimeType, "unsupported");
  const markdown = documentText(input, mimeType);
  const blocks = markdownBlocks(markdown);
  const codeBlocks = codeBlocksFrom(blocks, input);
  const passages = passagesFrom(blocks, input);
  const links = extractLinks(input);
  return {
    status: "success",
    mimeType,
    extractor: { name: extractor, version: VERSION },
    passages,
    codeBlocks,
    ...links,
  };
}

function extractPdf(input: ExtractionInput, mimeType: string): ExtractionResult {
  const text = extractPdfText(input.body);
  if (!text) return empty(mimeType, "unsupported_or_ocr_required");
  const passages = passagesFrom(markdownBlocks(text), input);
  const links = extractLinks(input);
  return {
    status: "success",
    mimeType,
    extractor: { name: "textual-pdf", version: VERSION },
    passages,
    codeBlocks: [],
    ...links,
  };
}

function documentText(input: ExtractionInput, mimeType: string): string {
  const body = bodyText(input.body);
  if (mimeType === "text/html") return htmlText(input, body);
  return nonHtmlText(input, mimeType, body);
}

function bodyText(body: ExtractionInput["body"]): string {
  if (typeof body === "string") return body;
  return body ? new TextDecoder().decode(body) : "";
}

function nonHtmlText(input: ExtractionInput, mimeType: string, body: string): string {
  if (isRawGitHub(input.documentUrl))
    return rawCodeMarkdown(body || input.renderedText, input.documentUrl);
  if (mimeType === "application/json") return jsonText(body || input.renderedText);
  if (mimeType === "application/xml" || mimeType === "text/xml")
    return safeText(body || input.renderedText, true);
  // Markdown legitimately permits inline HTML, and a renderer that emits
  // Markdown for an HTML page carries whatever markup the page contained.
  // Sniffing the value decides whether it needs HTML sanitization; assuming it
  // never does let raw tags reach evidence through the Markdown branch.
  const value = input.markdown || body || input.renderedText;
  return safeText(value, /<\/?[a-z][^>]*>/i.test(value));
}

function rawCodeMarkdown(value: string, url: URL): string {
  const extension =
    url.pathname
      .split(".")
      .at(-1)
      ?.replace(/[^a-z0-9]/gi, "") ?? "";
  return `\`\`\`${extension}\n${value}\n\`\`\``;
}

function htmlText(input: ExtractionInput, body: string): string {
  const value = input.markdown || input.renderedText || body;
  return safeText(value, /<\/?[a-z][^>]*>/i.test(value));
}

function jsonText(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function passagesFrom(
  blocks: readonly ContentBlock[],
  input: ExtractionInput,
): readonly EvidencePassage[] {
  const grouped = groupText(blocks, input.documentPage);
  const limit = input.maxChars
    ? Math.max(1, Math.ceil(input.maxChars / PASSAGE_SIZE))
    : DEFAULT_PASSAGES;
  return select(grouped, input.focus, limit, input.documentUrl);
}

function groupText(
  blocks: readonly ContentBlock[],
  page: number | undefined,
): readonly Omit<EvidencePassage, "sourceUrl" | "trust" | "score" | "passageHash">[] {
  const output: Omit<EvidencePassage, "sourceUrl" | "trust" | "score" | "passageHash">[] = [];
  let current: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.code) {
      pushGroup(output, current, page);
      current = [];
      continue;
    }
    if (block.text.length > PASSAGE_SIZE) {
      // A renderer that returns plain page text yields one very long block,
      // because `innerText` separates paragraphs with single newlines rather
      // than the blank lines Markdown needs. Dropping it silently cost the page
      // every passage it had. Split it on sentence boundaries instead: a
      // truncated passage is still evidence, an absent one is not.
      pushGroup(output, current, page);
      current = [];
      for (const piece of splitOversized(block.text))
        pushGroup(output, [{ ...block, text: piece }], page);
      continue;
    }
    if (
      current.length &&
      (current[0]?.heading !== block.heading || joinedLength(current, block) > PASSAGE_SIZE)
    ) {
      pushGroup(output, current, page);
      current = [];
    }
    current.push(block);
  }
  pushGroup(output, current, page);
  return output;
}

function pushGroup(
  output: Omit<EvidencePassage, "sourceUrl" | "trust" | "score" | "passageHash">[],
  blocks: readonly ContentBlock[],
  page: number | undefined,
): void {
  const text = blocks
    .map((block) => block.text)
    .join("\n\n")
    .trim();
  if (text)
    output.push({
      text,
      heading: blocks[0]?.heading,
      headingPath: blocks[0]?.headingPath,
      fragment: blocks[0]?.fragment,
      documentPage: page,
    });
}

function joinedLength(blocks: readonly ContentBlock[], next: ContentBlock): number {
  return (
    blocks.reduce((size, block) => size + block.text.length, next.text.length) + blocks.length * 2
  );
}

/**
 * Cuts an oversized block into passage-sized pieces, preferring sentence ends
 * so a passage stays quotable. Falls back to a hard cut when a single run has
 * no boundary, which keeps pathological input bounded rather than unbounded.
 */
function splitOversized(text: string): readonly string[] {
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > PASSAGE_SIZE) {
    const window = rest.slice(0, PASSAGE_SIZE);
    const boundary = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("\n"),
    );
    const cut = boundary > PASSAGE_SIZE / 2 ? boundary + 1 : PASSAGE_SIZE;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function select(
  passages: readonly Omit<EvidencePassage, "sourceUrl" | "trust" | "score" | "passageHash">[],
  focus: string | undefined,
  limit: number,
  url: URL,
): readonly EvidencePassage[] {
  const tokens = new Set((focus ?? "").toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []);
  const ranked = passages
    .map((passage) => ({ passage, score: score(passage.text, tokens) }))
    .sort((a, b) => b.score - a.score);
  const selected: EvidencePassage[] = [];
  for (const item of ranked) {
    if (
      selected.length >= limit ||
      selected.some((value) => value.heading === item.passage.heading)
    )
      continue;
    selected.push({
      ...item.passage,
      sourceUrl: url,
      trust: "external_untrusted",
      score: item.score,
      passageHash: hash(item.passage.text),
    });
  }
  return selected;
}

function score(text: string, focus: ReadonlySet<string>): number {
  if (focus.size === 0) return Math.min(text.length, PASSAGE_SIZE) / PASSAGE_SIZE;
  const lowered = text.toLowerCase();
  return [...focus].reduce((value, token) => value + (lowered.includes(token) ? 1 : 0), 0);
}

function codeBlocksFrom(
  blocks: readonly ContentBlock[],
  input: ExtractionInput,
): readonly EvidenceCodeBlock[] {
  return blocks.flatMap((block) =>
    block.code
      ? [
          {
            text: block.code.text,
            language: block.code.language,
            trust: "external_untrusted" as const,
            invisibleCharacterWarnings: codeWarnings(block.code.text),
            heading: block.heading,
            fragment: block.fragment,
            documentPage: input.documentPage,
            contentHash: hash(block.code.text),
          },
        ]
      : [],
  );
}

function extractorFor(mimeType: string, url: URL): ExtractorName | undefined {
  if (mimeType === "text/html") return "obscura-native-markdown";
  if (mimeType === "text/plain") return isRawGitHub(url) ? "github-raw-code" : "plain-text";
  if (mimeType === "text/markdown") return "markdown";
  if (mimeType === "application/json") return "json";
  if (mimeType === "application/xml" || mimeType === "text/xml") return "xml";
  if (mimeType.startsWith("text/x-") || isRawGitHub(url)) return "github-raw-code";
  return undefined;
}

function mediaKind(mimeType: string): "image" | "audio" | "video" | undefined {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return undefined;
}

function byteLength(body: string | Uint8Array | undefined): number {
  return typeof body === "string"
    ? new TextEncoder().encode(body).byteLength
    : (body?.byteLength ?? 0);
}

function empty(
  mimeType: string,
  status: ExtractionResult["status"],
  media?: ExtractionResult["media"],
): ExtractionResult {
  return {
    status,
    mimeType,
    passages: [],
    codeBlocks: [],
    contentLinks: [],
    navigationLinks: [],
    media,
  };
}

function hash(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}
