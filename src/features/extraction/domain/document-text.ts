import type { ExtractionInput } from "@/features/extraction";
import { isRawGitHub } from "@/features/extraction/domain/mime";
import { safeText } from "@/features/extraction/domain/safe-content";

export function documentText(input: ExtractionInput, mimeType: string): string {
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
  return sniffedSafeText(input.markdown || body || input.renderedText);
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
  return sniffedSafeText(input.markdown || input.renderedText || body);
}

/**
 * Sanitizes as HTML only when the value actually carries markup. Markdown
 * legitimately permits inline HTML, and a renderer that emits Markdown for an
 * HTML page carries whatever markup the page contained, so the decision must
 * follow the bytes rather than the declared type.
 */
function sniffedSafeText(value: string): string {
  return safeText(value, /<\/?[a-z][^>]*>/i.test(value));
}

function jsonText(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    // A hostile origin can declare `application/json` and serve active markup.
    // Unparseable bodies are returned as text, so they must still be sanitized
    // or the declared type becomes a way to bypass sanitization entirely.
    return sniffedSafeText(value);
  }
}
