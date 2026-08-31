import type { EvidencePassage } from "@/features/extraction";

const PASSAGE_SIZE = 1_200;

export function select(
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

/**
 * Words a question is built from rather than about. They appear in nearly every
 * passage of a page, so counting them alongside the terms that name a subject
 * let grammar decide which passage is evidence: measured against SQLite's FTS5
 * page, the returned passage matched `to`, `at`, `and` and `or`, while the
 * section titled "Building a Loadable Extension" carried three of the expected
 * phrases and lost for using four fewer connectives.
 */
const connectives = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "to",
  "under",
  "use",
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

function score(text: string, focus: ReadonlySet<string>): number {
  if (focus.size === 0) return Math.min(text.length, PASSAGE_SIZE) / PASSAGE_SIZE;
  const lowered = text.toLowerCase();
  // A connective still counts, because a question made entirely of common
  // words must still rank something - it just cannot outweigh a term that
  // names the subject.
  return [...focus].reduce(
    (value, token) => value + (lowered.includes(token) ? (connectives.has(token) ? 0.1 : 1) : 0),
    0,
  );
}

/** Content identity for a passage or a code block. */
export function hash(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}
