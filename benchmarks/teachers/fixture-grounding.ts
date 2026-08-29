import { array, record, requiredString, webUrl, type JsonRecord } from "./contract-json.ts";

export type GroundingVerification = {
  accepted_claim_ids: string[];
  rejected_claims: { id: string; reason: string }[];
};

type GroundingCorpus = { text: string; urls: Set<string> };

/**
 * Deterministic, LLM-free replacement for cross-model fixture verification
 * (ADR-0006). A drafted claim becomes a fixture requirement only when it is
 * literally grounded in the captured teacher trace and is lexically gradable.
 * The same evidence and draft always produce the same acceptances and the same
 * rejection reasons, so `audit-cases.ts` can recompute this result instead of
 * trusting an archived provider response.
 */
export function verifyDraftGrounding(
  evidenceValue: unknown,
  draftValue: unknown,
): GroundingVerification {
  const corpus = groundingCorpus(evidenceValue);
  const accepted: string[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const [index, claimValue] of array(
    record(draftValue, "fixture draft").claims,
    "fixture draft claims",
  ).entries()) {
    const claim = record(claimValue, `fixture draft claims[${index}]`);
    const id = requiredString(claim.id, `fixture draft claims[${index}].id`);
    const reason = rejectionReason(claim, corpus, id);
    if (reason === undefined) accepted.push(id);
    else rejected.push({ id, reason });
  }
  return { accepted_claim_ids: accepted, rejected_claims: rejected };
}

function rejectionReason(
  claim: JsonRecord,
  corpus: GroundingCorpus,
  id: string,
): string | undefined {
  // Codex `exec --json` exposes search actions but never tool-result payloads,
  // so a Codex-only trace carries its quoted evidence inside the final answer
  // rather than as structured passages. Grounding is therefore proven against
  // every observable field, and each cited source must be a URL the run
  // actually opened, cited, or selected.
  for (const [sourceIndex, sourceValue] of array(claim.sources, `claim ${id} sources`).entries()) {
    const source = record(sourceValue, `claim ${id} sources[${sourceIndex}]`);
    const label = `claim ${id} sources[${sourceIndex}]`;
    const urls = [
      webUrl(source.url, `${label}.url`),
      ...array(source.equivalent_urls, `${label}.equivalent_urls`, true).map((value, index) =>
        webUrl(value, `${label}.equivalent_urls[${index}]`),
      ),
    ];
    for (const url of urls) {
      if (!corpus.urls.has(url)) {
        return `claim source is absent from teacher-run evidence: ${url}`;
      }
    }
  }
  for (const [index, conceptValue] of array(
    claim.required_concepts,
    `claim ${id} required_concepts`,
  ).entries()) {
    const concept = requiredString(conceptValue, `claim ${id} required_concepts[${index}]`);
    if (!conceptGrounded(concept, corpus)) {
      return `required concept is absent from teacher-run evidence: ${concept}`;
    }
  }
  if (!claimTextGrounded(requiredString(claim.text, `claim ${id} text`), corpus)) {
    return "claim text is not lexically grounded in teacher-run evidence";
  }
  for (const [index, patternValue] of array(
    claim.acceptable_patterns,
    `claim ${id} acceptable_patterns`,
  ).entries()) {
    const source = requiredString(patternValue, `claim ${id} acceptable_patterns[${index}]`);
    let pattern: RegExp;
    try {
      pattern = RegExp(source, "iu");
    } catch {
      return `grading pattern is not a valid regular expression: ${source}`;
    }
    if (!pattern.test(corpus.text)) {
      return `grading pattern matches no teacher-run evidence: ${source}`;
    }
  }
  return undefined;
}

/**
 * Concept labels are stable identifiers rather than quotations: drafts emit
 * prose ("generic build"), identifier forms ("probabilistic_ranking"), and
 * abbreviations ("within_doc_tf") whose words the evidence never writes
 * adjacently. Identifier styling must not decide whether a claim survives, so
 * separators are normalized before matching.
 *
 * A label is grounded when its words appear adjacently, or when all of them
 * occur inside one window of evidence text whose total span is at most
 * `conceptProximityWindow` characters. Proximity is required because tokens
 * scattered across unrelated sentences, queries, and URLs do not show the
 * evidence expressed the concept; the window keeps the match local without
 * demanding a contiguity that abbreviations cannot satisfy.
 *
 * The span is measured between the outermost matched tokens, not from an
 * arbitrary anchor, so the accepted distance is exactly the stated window. The
 * value is a readability bound rather than a tuned constant: 160 characters is
 * roughly one to two sentences of prose, the scale at which a multi-word
 * concept is plausibly expressed in a single statement.
 */
const conceptProximityWindow = 160;

function conceptGrounded(concept: string, corpus: GroundingCorpus): boolean {
  const tokens = concept
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return false;
  const adjacent = `(?<![a-z0-9])${tokens.map(escapeRegExp).join("[^a-z0-9]+")}(?![a-z0-9])`;
  if (RegExp(adjacent, "u").test(corpus.text)) return true;

  // Distinct tokens only: a label that repeats a word does not need two
  // separate occurrences of it to be considered locally expressed.
  const distinctTokens = [...new Set(tokens)];
  const occurrences = distinctTokens.map((token) => wordIndexesOf(corpus.text, token));
  if (occurrences.some((positions) => positions.length === 0)) return false;
  return hasBoundedSpan(occurrences, conceptProximityWindow);
}

/**
 * True when one position can be chosen from every list such that the distance
 * between the smallest and largest choice is within `window`. Repeatedly
 * advancing the list holding the current minimum is the standard minimum-range
 * sweep: it visits every candidate window in ascending order, so no valid match
 * is missed.
 */
function hasBoundedSpan(occurrences: number[][], window: number): boolean {
  const cursors = occurrences.map(() => 0);
  for (;;) {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let minimumList = 0;
    for (const [list, positions] of occurrences.entries()) {
      const position = positions[cursors[list] ?? 0];
      if (position === undefined) return false;
      if (position < minimum) {
        minimum = position;
        minimumList = list;
      }
      if (position > maximum) maximum = position;
    }
    if (maximum - minimum <= window) return true;
    const advanced = (cursors[minimumList] ?? 0) + 1;
    cursors[minimumList] = advanced;
    if (advanced >= (occurrences[minimumList]?.length ?? 0)) return false;
  }
}

/**
 * Every whole-word occurrence, in ascending order. Occurrences are not capped:
 * truncating them could reject a concept genuinely grounded later in the
 * evidence, and the evidence projection is already bounded.
 */
function wordIndexesOf(haystack: string, word: string): number[] {
  const positions: number[] = [];
  const pattern = RegExp(`(?<![a-z0-9])${escapeRegExp(word)}(?![a-z0-9])`, "gu");
  for (let match = pattern.exec(haystack); match !== null; match = pattern.exec(haystack)) {
    positions.push(match.index);
  }
  return positions;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * A claim's own proposition must be visible in the evidence, not merely its
 * concepts and patterns. Grading is lexical, so this checks that the claim's
 * distinctive content words are present rather than attempting entailment: a
 * claim that introduces vocabulary the trace never used cannot have been
 * derived from it.
 *
 * Every distinctive word must be present. No partial-match tolerance is
 * allowed, because any tolerance admits exactly the failure this check exists
 * to prevent: a claim that is mostly quoted vocabulary plus one invented term
 * carrying the false assertion. Short function words are ignored because they
 * carry no evidential weight.
 */
function claimTextGrounded(text: string, corpus: GroundingCorpus): boolean {
  const contentWords = new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((word) => word.length > 3 && !claimStopWords.has(word)),
  );
  if (contentWords.size === 0) return false;
  return [...contentWords].every((word) => containsWord(corpus.text, word));
}

/**
 * Matches a whole word rather than a substring, so "cat" is not grounded by
 * "concatenate".
 */
function containsWord(haystack: string, word: string): boolean {
  return RegExp(`(?<![a-z0-9])${escapeRegExp(word)}(?![a-z0-9])`, "u").test(haystack);
}

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
  "does",
  "using",
  "used",
  "use",
]);

/**
 * Flattens every observable teacher-run field a claim may be graded against
 * into one lowercase haystack plus the set of observed URLs.
 */
function groundingCorpus(evidenceValue: unknown): GroundingCorpus {
  const evidence = record(evidenceValue, "fixture evidence");
  const fragments: string[] = [];
  const urls = new Set<string>();
  for (const [runIndex, runValue] of array(evidence.runs, "fixture evidence runs").entries()) {
    const label = `fixture evidence runs[${runIndex}]`;
    const run = record(runValue, label);
    fragments.push(requiredString(run.final_answer, `${label}.final_answer`));
    for (const [index, queryValue] of array(run.queries, `${label}.queries`, true).entries()) {
      fragments.push(requiredString(queryValue, `${label}.queries[${index}]`));
    }
    for (const [index, resultValue] of array(
      run.tool_results,
      `${label}.tool_results`,
      true,
    ).entries()) {
      const result = record(resultValue, `${label}.tool_results[${index}]`);
      fragments.push(requiredString(result.summary, `${label}.tool_results[${index}].summary`));
    }
    for (const [index, passageValue] of array(
      run.evidence_passages,
      `${label}.evidence_passages`,
      true,
    ).entries()) {
      const passage = record(passageValue, `${label}.evidence_passages[${index}]`);
      const url = webUrl(passage.url, `${label}.evidence_passages[${index}].url`);
      urls.add(url);
      fragments.push(url);
      fragments.push(requiredString(passage.text, `${label}.evidence_passages[${index}].text`));
    }
    for (const field of ["opened_urls", "cited_urls"] as const) {
      for (const [index, urlValue] of array(run[field], `${label}.${field}`, true).entries()) {
        const url = webUrl(urlValue, `${label}.${field}[${index}]`);
        urls.add(url);
        fragments.push(url);
      }
    }
    for (const [index, sourceValue] of array(
      run.selected_sources,
      `${label}.selected_sources`,
      true,
    ).entries()) {
      const source = record(sourceValue, `${label}.selected_sources[${index}]`);
      const url = webUrl(source.url, `${label}.selected_sources[${index}].url`);
      urls.add(url);
      fragments.push(url);
      fragments.push(requiredString(source.title, `${label}.selected_sources[${index}].title`));
    }
  }
  return { text: fragments.join("\n").toLowerCase(), urls };
}
