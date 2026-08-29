import { sanitizeExternalHtml, sanitizeOutboundUrl } from "@/features/security";

const INVISIBLE: readonly [RegExp, string][] = [
  [/\u200b/g, "zero_width_space"],
  [/\u200c/g, "zero_width_non_joiner"],
  [/\u200d/g, "zero_width_joiner"],
  [/\u202a|\u202b|\u202d|\u202e|\u2066|\u2067|\u2068|\u2069/g, "bidirectional_control"],
];

export function safeText(value: string, html: boolean): string {
  const stripped = html ? sanitizeExternalHtml(value) : value;
  return stripped
    .replace(/<\/?(?:script|style|form|iframe|object|embed|svg|template)\b[^>]*>/gi, "")
    .replace(/\]\s*\(\s*(?:javascript|data|vbscript):[^)]*\)/gi, "]")
    .trim();
}

export function codeWarnings(text: string): readonly string[] {
  return INVISIBLE.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
}

export function safeLink(url: URL): URL | undefined {
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (/(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com)$/i.test(url.hostname))
    return undefined;
  return sanitizeOutboundUrl(url);
}
