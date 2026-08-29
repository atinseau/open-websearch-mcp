import type {
  Candidate,
  CandidateSourceType,
  RenderedDocument,
  SuggestedQuery,
} from "@/features/discovery";
import { assessPublicUrl } from "@/features/security";

export type SerpParseResult =
  | {
      readonly kind: "parsed";
      readonly candidates: readonly Candidate[];
      readonly suggestedQueries: readonly SuggestedQuery[];
    }
  | { readonly kind: "blocked"; readonly reason: "captcha" | "waf" | "consent_required" }
  | { readonly kind: "empty"; readonly suggestedQueries: readonly SuggestedQuery[] }
  | { readonly kind: "parse_failure"; readonly diagnostic: "unrecognized_serp_markup" };

const blockedMarkers: ReadonlyArray<readonly [RegExp, "captcha" | "waf" | "consent_required"]> = [
  [/unusual traffic|recaptcha|not a robot/i, "captcha"],
  [/access denied|web application firewall|temporarily blocked/i, "waf"],
  [/before you continue|consent\.google/i, "consent_required"],
];
const googleHost = /(^|\.)google\.[a-z.]+$/i;
const authentication = /(?:^|[./_-])(login|signin|sign-in|auth|account)(?:[./_-]|$)/i;

/** Parses only rendered Google evidence; no text from a SERP authorizes navigation. */
export function parseGoogleSerp(document: RenderedDocument): SerpParseResult {
  const blocked = blockedReason(document.text);
  if (blocked) return { kind: "blocked", reason: blocked };
  const suggestedQueries = suggestions(document);
  const candidates = candidatesFrom(document);
  if (candidates.length > 0) return { kind: "parsed", candidates, suggestedQueries };
  if (emptySerp(document.text)) return { kind: "empty", suggestedQueries };
  return { kind: "parse_failure", diagnostic: "unrecognized_serp_markup" };
}

function candidatesFrom(document: RenderedDocument): readonly Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const link of document.links) {
    const url = destination(link.url);
    if (!url || !isCandidate(url, link.url, link.text)) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ url, sourceType: sourceType(link.text, url), title: title(link.text) });
  }
  return candidates;
}

function destination(link: URL): URL | undefined {
  if (!googleHost.test(link.hostname)) return link;
  if (!/^\/(?:url|imgres)$/u.test(link.pathname)) return undefined;
  const target = link.searchParams.get("q") ?? link.searchParams.get("url");
  try {
    return target ? new URL(target) : undefined;
  } catch {
    return undefined;
  }
}

function isCandidate(url: URL, original: URL, text: string): boolean {
  if (!assessPublicUrl(url).allowed || googleHost.test(url.hostname)) return false;
  if (original.pathname.includes("aclk") || original.searchParams.has("adurl")) return false;
  return (
    text.trim().length > 0 &&
    !/\b(?:ad|sponsored)\b/i.test(text) &&
    !authentication.test(url.hostname + url.pathname)
  );
}

function sourceType(text: string, url: URL): CandidateSourceType {
  const value = `${text} ${url.hostname}${url.pathname}`.toLowerCase();
  if (/\b(news|top stories|headline)\b/.test(value)) return "news";
  if (/\b(discussion|forum|reddit|stack overflow|stackoverflow)\b/.test(value)) return "discussion";
  if (/\b(video|youtube|vimeo)\b/.test(value)) return "video";
  if (/\b(academic|scholar|journal|doi\.org|arxiv)\b/.test(value)) return "academic";
  if (/\b(document|pdf|filetype:|\.pdf(?:$|[?#]))\b/.test(value)) return "document";
  if (/\b(other results|shopping|images|maps)\b/.test(value)) return "other";
  return "organic";
}

function suggestions(document: RenderedDocument): readonly SuggestedQuery[] {
  const output: SuggestedQuery[] = [];
  const seen = new Set<string>();
  for (const link of document.links) {
    const source = suggestionSource(link.url, link.text);
    const query = link.text.trim().replace(/\s+/g, " ");
    const key = query.toLocaleLowerCase();
    if (!source || !query || seen.has(key) || output.length === 8) continue;
    seen.add(key);
    output.push({ query, source });
  }
  return output;
}

function suggestionSource(url: URL, text: string): SuggestedQuery["source"] | undefined {
  if (!googleHost.test(url.hostname) || url.pathname !== "/search" || !url.searchParams.has("q"))
    return undefined;
  return /people also ask|related searches|related/i.test(text)
    ? /people also ask/i.test(text)
      ? "google_question"
      : "google_related"
    : undefined;
}

function blockedReason(text: string): "captcha" | "waf" | "consent_required" | undefined {
  return blockedMarkers.find(([pattern]) => pattern.test(text))?.[1];
}
function emptySerp(text: string): boolean {
  return /did not match any documents|no results found/i.test(text);
}
function title(value: string): string | undefined {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || undefined;
}
