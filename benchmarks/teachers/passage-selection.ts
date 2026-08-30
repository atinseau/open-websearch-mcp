import { conceptGrounded } from "./fixture-grounding.ts";

/**
 * Rebuilds the ground truth the teacher run never exposed: given a page the
 * teacher cited, decide which bounded portion of it supports a claim.
 *
 * The predicate is the one the grader already applies when it judges a returned
 * page — every required concept present, at least one acceptable pattern matched.
 * Restating it in different words here would let the capture drift from the
 * thing being scored, so it is deliberately the same test.
 *
 * Concepts are matched the way verification matches them, not literally. The
 * corpus writes them as identifiers — `ws_url`, `tools-capability` — which no
 * page spells that way, so a literal test rejected pages that plainly express
 * the concept and left the denominator nearly empty.
 */

/** A claim as the sealed teacher corpus stores it. */
export interface CapturedClaim {
  readonly id: string;
  readonly required_concepts: readonly string[];
  readonly acceptable_patterns: readonly string[];
}

/** One page already retrieved by the caller; this module performs no I/O. */
export interface RetrievedPage {
  readonly url: string;
  readonly content: string;
}

/** An evidence passage, shaped as the fixture schema stores it. */
export interface EvidencePassage {
  readonly url: string;
  readonly text: string;
}

export interface PassageSelection {
  readonly passage?: EvidencePassage;
  /** Why nothing was selected, named precisely enough to act on. */
  readonly reason?: string;
}

/** Matches the grader's own comparison, which is case- and width-insensitive. */
function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

function missingConcept(claim: CapturedClaim, content: string): string | undefined {
  const corpus = { text: normalized(content), urls: new Set<string>() };
  return claim.required_concepts.find((concept) => !conceptGrounded(concept, corpus));
}

function matchesAnyPattern(claim: CapturedClaim, content: string): boolean {
  const text = normalized(content);
  return claim.acceptable_patterns.some((pattern) => new RegExp(pattern, "iu").test(text));
}

export function selectEvidencePassage(claim: CapturedClaim, page: RetrievedPage): PassageSelection {
  const absent = missingConcept(claim, page.content);
  if (absent !== undefined) return { reason: `page does not contain required concept: ${absent}` };
  if (!matchesAnyPattern(claim, page.content))
    return { reason: "page matches no acceptable pattern for this claim" };
  const bounded = smallestSupportingSpan(claim, page.content);
  return { passage: { url: page.url, text: bounded } };
}

/**
 * The shortest run of consecutive paragraphs that still satisfies the claim.
 * A whole page would pass the grader's substring test trivially, proving
 * nothing about extraction; the narrowest span that still supports the claim is
 * what `CONTEXT.md` means by a bounded evidence passage.
 *
 * Found by sliding a window: widen the end until the span supports the claim,
 * then pull the start forward while it still does. Each boundary advances at
 * most once per paragraph, so a long page costs proportionally to its length
 * rather than to its length cubed. Ties resolve to the earliest start, which
 * keeps the result deterministic.
 *
 * Spans are cut from the page by offset rather than rebuilt from its parts.
 * Rejoining paragraphs with a canonical separator silently rewrote pages that
 * use \r\n or a whitespace-only blank line, and the grader compares by
 * substring, so the rewritten passage no longer matched the page it came from.
 */
function smallestSupportingSpan(claim: CapturedClaim, content: string): string {
  const paragraphs = paragraphSpans(content);
  let shortest: string | undefined;
  let start = 0;
  for (let end = 0; end < paragraphs.length; end += 1) {
    while (start <= end) {
      const from = paragraphs[start];
      const to = paragraphs[end];
      if (from === undefined || to === undefined) break;
      const span = content.slice(from.start, to.end);
      if (missingConcept(claim, span) !== undefined || !matchesAnyPattern(claim, span)) break;
      if (shortest === undefined || span.length < shortest.length) shortest = span;
      start += 1;
    }
  }
  return shortest ?? content;
}

/** Paragraph boundaries as offsets into the page, so spans stay verbatim. */
function paragraphSpans(content: string): readonly { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const separator = /(?:\r?\n)[^\S\r\n]*(?:\r?\n)+/gu;
  let cursor = 0;
  for (const match of content.matchAll(separator)) {
    const end = match.index;
    if (content.slice(cursor, end).trim().length > 0) spans.push({ start: cursor, end });
    cursor = end + match[0].length;
  }
  if (content.slice(cursor).trim().length > 0) spans.push({ start: cursor, end: content.length });
  return spans;
}
