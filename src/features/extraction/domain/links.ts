import type { ExtractedLink, ExtractionInput } from "@/features/extraction";
import { safeLink } from "@/features/extraction/domain/safe-content";

export function extractLinks(input: ExtractionInput): {
  readonly contentLinks: readonly ExtractedLink[];
  readonly navigationLinks: readonly ExtractedLink[];
} {
  const content: ExtractedLink[] = [];
  const navigation: ExtractedLink[] = [];
  const seen = new Set<string>();
  for (const link of input.links ?? []) {
    const url = safeLink(link.url);
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    const output = {
      title: link.text.trim() || url.hostname,
      url,
      context: link.text.trim() || undefined,
    };
    const target = navigationLink(url, input.documentUrl, link.text) ? navigation : content;
    if (target.length < (target === navigation ? 10 : 20)) target.push(output);
  }
  return { contentLinks: content, navigationLinks: navigation };
}

function navigationLink(url: URL, source: URL, text: string): boolean {
  return (
    url.origin === source.origin ||
    /^(home|menu|navigation|next|previous|sign in|log in)$/i.test(text.trim())
  );
}
