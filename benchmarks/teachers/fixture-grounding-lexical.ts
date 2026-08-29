const claimStopWords = new Set([
  "that",
  "this",
  "these",
  "those",
  "with",
  "from",
  "into",
  "than",
  "then",
  "when",
  "while",
  "where",
  "which",
  "their",
  "there",
  "them",
  "they",
  "also",
  "have",
  "has",
  "had",
  "been",
  "being",
  "does",
  "not",
  "but",
  "and",
  "for",
  "are",
  "its",
  "it",
  "the",
  "only",
  "each",
  "both",
  "same",
  "such",
  "over",
  "under",
  "after",
  "before",
  "because",
  "however",
  "rather",
  "still",
  "some",
  "more",
  "most",
  "other",
  "another",
  "every",
  "must",
  "should",
  "would",
  "could",
  "will",
  "can",
  "may",
  "using",
  "used",
  "use",
]);

/** Checks that every distinctive word in a claim is observable evidence. */
export function claimTextGrounded(text: string, corpusText: string): boolean {
  const contentWords = new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((word) => word.length > 3 && !claimStopWords.has(word)),
  );
  return contentWords.size > 0 && [...contentWords].every((word) => containsWord(corpusText, word));
}

function containsWord(haystack: string, word: string): boolean {
  return RegExp(`(?<![a-z0-9])${escapeRegExp(word)}(?![a-z0-9])`, "u").test(haystack);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
