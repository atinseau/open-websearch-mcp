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
import { codeWarnings } from "@/features/extraction/domain/safe-content";
import { documentText } from "@/features/extraction/domain/document-text";

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
  const weights = discrimination(tokens, passages);
  const ranked = passages
    .map((passage) => ({ passage, score: score(passage.text, weights) }))
    .sort((a, b) => b.score - a.score);
  const selected: EvidencePassage[] = [];
  for (const item of ranked) {
    // Diversity is per heading, but an absent heading is not a shared heading.
    // Treating `undefined === undefined` as a duplicate collapsed every
    // headingless slice of an unstructured page into one passage, so a page
    // whose navigation chrome scored first lost all of its substantive text.
    const duplicate =
      item.passage.heading !== undefined &&
      selected.some((value) => value.heading === item.passage.heading);
    if (selected.length >= limit || duplicate) continue;
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

function score(text: string, weights: ReadonlyMap<string, number>): number {
  if (weights.size === 0) return Math.min(text.length, PASSAGE_SIZE) / PASSAGE_SIZE;
  const lowered = text.toLowerCase();
  let total = 0;
  for (const [token, weight] of weights) if (lowered.includes(token)) total += weight;
  return total;
}

/**
 * How much each of the question's terms tells one part of a page from another.
 *
 * Counting matched terms equally let a passage that happened to use several
 * ordinary words beat one that used the rare term naming the subject. Measured
 * against the WHATWG URL Standard, the two returned passages carried
 * "validation error" - a phrase that page uses throughout - while the section
 * on the path percent-encode set, which the question was about, was left
 * behind.
 *
 * A term found in every passage cannot point anywhere, and a term found in one
 * points straight at it, so a term's weight is how few passages contain it.
 */
function discrimination(
  tokens: ReadonlySet<string>,
  passages: readonly { readonly text: string }[],
): ReadonlyMap<string, number> {
  const weights = new Map<string, number>();
  if (tokens.size === 0 || passages.length === 0) return weights;
  const lowered = passages.map((passage) => passage.text.toLowerCase());
  for (const token of tokens) {
    const carrying = lowered.filter((text) => text.includes(token)).length;
    if (carrying === 0) continue;
    weights.set(token, lowered.length / carrying);
  }
  return weights;
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
