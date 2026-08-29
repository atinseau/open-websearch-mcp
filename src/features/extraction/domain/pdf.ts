/** Minimal deterministic textual-PDF path, justified by SPK-005's Bun/PDF.js probe. */
export function extractPdfText(body: string | Uint8Array | undefined): string | undefined {
  const source = asLatin1(body);
  if (!source.startsWith("%PDF-")) return undefined;
  const values = [...source.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj\b/g)].map((match) =>
    decodePdfString(match[0] ?? ""),
  );
  return values.join(" ").replace(/\s+/g, " ").trim() || undefined;
}

function asLatin1(body: string | Uint8Array | undefined): string {
  if (typeof body === "string") return body;
  if (!body) return "";
  return new TextDecoder("latin1").decode(body);
}

function decodePdfString(value: string): string {
  return value.slice(1, value.lastIndexOf(")")).replace(/\\([()\\])/g, "$1");
}
