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
    : (input.maxPassages ?? DEFAULT_PASSAGES);
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

function score(text: string, focus: ReadonlySet<string>): number {
  if (focus.size === 0) return Math.min(text.length, PASSAGE_SIZE) / PASSAGE_SIZE;
  const lowered = text.toLowerCase();
  const matched = [...focus].reduce((value, token) => value + (lowered.includes(token) ? 1 : 0), 0);
  return isNavigation(text) ? matched * NAVIGATION_WEIGHT : matched;
}

/**
 * Whether a passage is a page's navigation rather than its content.
 *
 * A rendered documentation page opens with its whole menu collapsed into one
 * run, because each label is its own element with no text between them:
 * `Documentation IndexFetch the complete...Skip to main contentModel Context
 * Protocol home pageVersion 2026-07-28`. That run names every section a site
 * has, so it matches more of any question than the section that answers one.
 *
 * Measured on `modelcontextprotocol.io`, it was the first of 58 blocks, 2,462
 * characters, and scored 14 where the block holding "MUST declare the tools
 * capability" scored 5 and ranked tenth - the case scored zero for evidence
 * coverage with that sentence on the page.
 *
 * The glue is the signal: 2.84 lowercase-uppercase joins per 100 characters
 * there against 0.76 in the prose, and only 4 of that page's 58 blocks exceed
 * two. Prose that merely names products or people stays well under it.
 */
function isNavigation(text: string): boolean {
  if (text.length < NAVIGATION_MINIMUM) return false;
  const joins = (text.match(/\p{Ll}\p{Lu}/gu) ?? []).length;
  return joins / (text.length / 100) >= NAVIGATION_JOINS_PER_100;
}

/**
 * Short runs are not menus, whatever their capitalisation. An oversized block
 * is cut into passage-sized pieces before anything is scored, so the threshold
 * has to admit a piece of a menu, not only a whole one.
 */
const NAVIGATION_MINIMUM = 200;
const NAVIGATION_JOINS_PER_100 = 2;
/**
 * Navigation still counts, faintly: a page that is only a menu must still rank
 * something rather than returning nothing.
 */
const NAVIGATION_WEIGHT = 0.1;

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
