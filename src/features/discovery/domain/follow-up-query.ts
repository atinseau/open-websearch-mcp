/**
 * Derives a keyword follow-up query from a long natural-language question.
 *
 * A search engine answers a verbose question with a site's front page: asked
 * about "using the generic build outside a browser", it returns pdf.js/ rather
 * than pdf.js/examples/. The same question reduced to its distinctive terms
 * reaches the specific page the agent asked about.
 *
 * This never replaces the agent's query. SEARCH-001 forbids silent rewriting,
 * so the authored text is always issued first and unchanged; this is a second,
 * explicitly reported attempt under SEARCH-008 when the first pass leaves the
 * result insufficient.
 */
const questionWords = new Set([
  // English question and connective scaffolding.
  "a",
  "about",
  "according",
  "an",
  "and",
  "any",
  "apply",
  "are",
  "as",
  "at",
  "be",
  "browser",
  "but",
  "by",
  "can",
  "current",
  "currently",
  "describe",
  "do",
  "does",
  "during",
  "explain",
  "for",
  "from",
  "how",
  "in",
  "including",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "over",
  "require",
  "requires",
  "several",
  "should",
  "sources",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "under",
  "use",
  "used",
  "using",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "within",
  "would",
]);

/**
 * Words that survive the question scaffolding but still name no subject.
 *
 * These describe a document rather than identify one, and an engine matches
 * them against anything: measured live, "document" in a PDF.js follow-up
 * returned a French dictionary entry and a clinic's site, which then spent
 * result places the real documentation needed. They are dropped only when a
 * more distinctive term is available, so a question made entirely of them
 * still asks something.
 */
const genericWords = new Set([
  "api",
  "build",
  "case",
  "content",
  "data",
  "detail",
  "details",
  "document",
  "documentation",
  "example",
  "examples",
  "feature",
  "file",
  "general",
  "generic",
  "guide",
  "information",
  "official",
  "page",
  "primary",
  "reference",
  "source",
  "text",
  "type",
  "value",
  "version",
  "way",
  // The same words in the scripts the corpus asks in. A question frames itself
  // in its own language, and this list was spelled in English only: measured
  // live, the Japanese question opens by asking for 一次情報 and 公式仕様 -
  // primary sources, official specification - and the follow-up kept exactly
  // those, deriving 日本語 一次 情報 公式. That names "Japanese primary
  // information official" and nothing the question is about, while dropping
  // URL, ドメイン and 国際, which are what an engine needs.
  "情報",
  "公式",
  "一次",
  "仕様",
  "文書",
  "資料",
  "内容",
  "詳細",
  "例",
  "参考",
  "説明",
  "정보",
  "공식",
  "문서",
  "자료",
]);

/**
 * Fragments an unspaced script leaves behind that are grammar, not words.
 *
 * A segmenter splits Japanese into morphemes, so a verb's inflection arrives
 * as its own token: `使って` ("using") yields `使` and `って`. These pass the
 * English scaffolding list because they are not in it, and they identify
 * nothing. A language named as the answer's language - `日本語`, `한국어` -
 * frames the question the same way "in English" would.
 */
const scriptFragments = new Set([
  "って",
  "して",
  "され",
  "れる",
  "する",
  "ある",
  "など",
  "よう",
  "どの",
  "ため",
  "こと",
  "もの",
  "くだ",
  "さい",
  "日本語",
  "한국어",
  "中文",
]);

/**
 * Four terms, measured rather than guessed. Against a question an engine
 * answers with a site's front page, the first three to four distinctive terms
 * reach the specific page; adding more re-introduces the verbosity that caused
 * the front-page answer in the first place.
 */
const maximumTerms = 4;
const shortEnough = 60;

export function keywordFollowUp(query: string): string | undefined {
  if (query.length <= shortEnough) return undefined;
  const preserved = [...query.matchAll(/"[^"\n]+"|(?:^|\s)-?\w+:[^\s]+/gu)].map((match) =>
    match[0].trim(),
  );
  const remainder = query.replace(/"[^"\n]+"/gu, " ").replace(/(?:^|\s)-?\w+:[^\s]+/gu, " ");
  const terms = mostDistinctive(distinctiveTerms(remainder), maximumTerms - preserved.length);
  const follow = [...preserved, ...terms].join(" ").trim();
  if (!follow || follow.length >= query.length) return undefined;
  return follow;
}

/**
 * Takes the terms that identify a subject, keeping the question's own order.
 *
 * Taking simply the first few surviving words took whatever the sentence
 * happened to say early, which is usually the words describing the answer
 * rather than naming its subject. Identifiers and proper nouns are preferred,
 * ordinary vocabulary is used only to fill what remains.
 */
function mostDistinctive(terms: readonly string[], wanted: number): string[] {
  if (wanted <= 0) return [];
  const identifying = terms.filter(
    (term) => !genericWords.has(term.toLowerCase()) && !scriptFragments.has(term),
  );
  const chosen = new Set((identifying.length > 0 ? identifying : terms).slice(0, wanted));
  return terms.filter((term) => chosen.has(term));
}

/**
 * Keeps the words that identify the subject: proper nouns, identifiers, and
 * anything outside the Latin script, which question scaffolding does not cover.
 */
function distinctiveTerms(text: string): string[] {
  const terms: string[] = [];
  for (const term of words(text)) {
    if (term.length < 2) continue;
    if (questionWords.has(term.toLowerCase())) continue;
    if (terms.some((existing) => existing.toLowerCase() === term.toLowerCase())) continue;
    terms.push(term);
  }
  return terms;
}

/**
 * Segments by word rather than by character class, because Japanese and other
 * unspaced scripts otherwise collapse a whole clause into one "word" and the
 * follow-up stays as verbose as the question it was meant to sharpen.
 */
function words(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  const found: string[] = [];
  for (const part of segmenter.segment(text)) if (part.isWordLike) found.push(part.segment);
  // Identifiers such as `tools/list` or `Bun.WebView` are split by the
  // segmenter, so they are recovered whole alongside the segmented words.
  for (const match of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}_.:+#-]*[./][\p{L}\p{N}_.:+#-]+/gu))
    if (!found.includes(match[0])) found.unshift(match[0]);
  return found;
}
