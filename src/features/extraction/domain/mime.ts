import type { ExtractionInput } from "@/features/extraction";

const SNIFF_BYTES = 512;

export function identifyMime(input: ExtractionInput): string {
  const header = input.headers?.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (header && header !== "application/octet-stream") return header;
  return sniff(input);
}

function sniff(input: ExtractionInput): string {
  const value = source(input).trimStart();
  if (value.startsWith("%PDF-")) return "application/pdf";
  if (value.startsWith("{") || value.startsWith("[")) return "application/json";
  if (/^<\?xml\b|^<[^>]+xmlns[=:]/i.test(value)) return "application/xml";
  if (/^<!doctype html\b|^<html\b/i.test(value)) return "text/html";
  if (isRawGitHub(input.documentUrl)) return "text/x-source-code";
  if (input.markdown) return "text/markdown";
  return "text/plain";
}

function source(input: ExtractionInput): string {
  if (typeof input.body === "string") return input.body.slice(0, SNIFF_BYTES);
  if (input.body) return new TextDecoder().decode(input.body.slice(0, SNIFF_BYTES));
  return input.renderedText.slice(0, SNIFF_BYTES);
}

export function isRawGitHub(url: URL): boolean {
  return url.hostname === "raw.githubusercontent.com" || url.pathname.includes("/raw/");
}
