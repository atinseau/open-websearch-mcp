import type { QueryAnalysis, RankingProfile } from "./types";

const temporalWords = new Set([
  "latest",
  "recent",
  "today",
  "current",
  "news",
  "nouveau",
  "actualité",
]);

/** Normalizes local lexical terms without changing the Google query. */
export function analyzeQuery(query: string, profile: RankingProfile = "auto"): QueryAnalysis {
  const quotedPhrases = [...query.matchAll(/"([^"\n]+)"/gu)].map((match) => normalize(match[1]));
  const withoutOperators = query.replace(/(?:^|\s)-?\w+:[^\s]+/gu, " ").replace(/"[^"\n]+"/gu, " ");
  const tokens = lexicalTerms(withoutOperators);
  const selectedProfile = profile === "auto" ? selectProfile(tokens, query) : profile;
  return {
    tokens,
    quotedPhrases,
    temporal: hasTemporalIntent(tokens, query, selectedProfile),
    selectedProfile,
  };
}

function lexicalTerms(text: string): readonly string[] {
  const words = new Intl.Segmenter(undefined, { granularity: "word" }).segment(text);
  const terms: string[] = [];
  for (const part of words) if (part.isWordLike) terms.push(normalize(part.segment));
  for (const identifier of text.matchAll(/[\p{L}\p{N}_./:+#-]{2,}/gu)) {
    const term = normalize(identifier[0]);
    if (!terms.includes(term)) terms.push(term);
  }
  return [...new Set(terms)].filter((term) => term.length > 1);
}

function selectProfile(tokens: readonly string[], query: string): Exclude<RankingProfile, "auto"> {
  const text = `${tokens.join(" ")} ${query.toLocaleLowerCase()}`;
  if (/\b(api|typescript|javascript|python|rust|code|sdk|cli|bug|error)\b/u.test(text))
    return "technical";
  if (/\b(news|breaking|today|latest|recent|actualité)\b/u.test(text)) return "news";
  if (/\b(paper|research|study|journal|doi|arxiv|citation)\b/u.test(text)) return "academic";
  if (/\b(reddit|forum|community|discussion|opinions?)\b/u.test(text)) return "community";
  return "general";
}

function hasTemporalIntent(
  tokens: readonly string[],
  query: string,
  profile: Exclude<RankingProfile, "auto">,
): boolean {
  return (
    profile === "news" ||
    tokens.some((token) => temporalWords.has(token) || /^(?:19|20)\d{2}$/u.test(token)) ||
    /\b(?:before|after):\d{4}-\d{2}-\d{2}\b|\b(?:v|version)\d+/iu.test(query)
  );
}

function normalize(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase();
}
