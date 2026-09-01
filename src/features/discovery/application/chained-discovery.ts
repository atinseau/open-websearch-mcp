import type {
  GoogleDiscoveryInput,
  GoogleDiscoveryResult,
  GoogleDiscoveryService,
  GoogleProfile,
} from "@/features/discovery";
import { keywordFollowUp } from "@/features/discovery/domain/follow-up-query";
import { asksForCurrent, siteFollowUp } from "@/features/discovery/domain/site-query";

/** One engine's connector, named so a result can report where it came from. */
export interface NamedEngine {
  readonly name: string;
  discover(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult>;
}

/**
 * Consults engines in the configured order, moving on only when an engine
 * produced no answer at all (ADR-0014).
 *
 * `empty` and `parse_failure` deliberately stop the chain. An empty result is
 * a legitimate answer, and falling through would replace a true absence of
 * results with another index's noise. A parse failure is our own defect, and
 * falling through would hide it behind an engine that happens to work.
 */
export class ChainedDiscovery implements GoogleDiscoveryService {
  readonly #engines: readonly NamedEngine[];
  readonly #thinResultCount: number;
  readonly #widenedCandidateLimit: number;

  constructor(options: {
    readonly engines: readonly NamedEngine[];
    /** Below this many candidates a long query earns one keyword follow-up. */
    readonly thinResultCount?: number;
    /** Ceiling on the pool after later engines widen it. */
    readonly widenedCandidateLimit?: number;
  }) {
    if (options.engines.length === 0) throw new Error("discovery requires at least one engine");
    this.#engines = options.engines;
    this.#thinResultCount = options.thinResultCount ?? 6;
    this.#widenedCandidateLimit = options.widenedCandidateLimit ?? 14;
  }

  profile(): GoogleProfile {
    return { id: "google-public", persistent: true, importsUserCredentials: false };
  }

  /** Engines are awaited one at a time, which preserves the single-SERP rule. */
  async discover(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult> {
    const first = await this.#walk(input);
    const widened = await this.#widened(first, input);
    return this.#withScopedAsk(await this.#withFollowUp(widened, input), input);
  }

  /**
   * Asks the same question once more, scoped to the domain the results agree on.
   *
   * An engine answers a question about a project with that project's front page,
   * and the page the question is actually about sits one level in: measured
   * live, the PDF.js question returned `mozilla.github.io/pdf.js/` where the
   * expected page is `pdf.js/examples/`, and the same terms scoped to that
   * domain returned the expected page first.
   *
   * Spent only when the earlier passes left the result short, so a search that
   * already found enough pages pays nothing. SEARCH-001 is preserved: the
   * authored query was issued first and unchanged, a query the agent already
   * scoped is left alone, and the derived query is reported under SEARCH-008
   * rather than applied silently.
   */
  async #withScopedAsk(
    first: GoogleDiscoveryResult,
    input: GoogleDiscoveryInput,
  ): Promise<GoogleDiscoveryResult> {
    // The candidate count is deliberately not the signal: a first pass can
    // return ten links to a site's surface while the page asked about is
    // absent. Whether the source was reached in depth is what distinguishes
    // them, and `siteFollowUp` answers that.
    if (first.status !== "success") return first;
    // The scope answers which source to ask; the terms answer what to ask it.
    // Pairing the scope with the verbose question reproduces the phrasing that
    // made the engine answer with a front page in the first place.
    const asked = first.followUpQuery ?? keywordFollowUp(input.query) ?? input.query;
    const scoped = siteFollowUp(
      asked,
      first.candidates.map((candidate) => candidate.url),
      // A question asking what is current wants the newest release a versioned
      // site keeps live, and engines index the older ones best.
      {
        current: asksForCurrent(input.query),
        // A run surfaces only some of a site's versions in its paths, so the
        // dates its titles carry are counted too.
        versionsSeen: datesIn(first.candidates.map((candidate) => candidate.title ?? "")),
      },
    );
    if (scoped === undefined) return first;
    const result = await this.#walk({ ...input, query: scoped });
    if (result.status !== "success") return first;
    const seen = new Set(first.candidates.map((candidate) => candidate.url.toString()));
    const added = result.candidates.filter((candidate) => !seen.has(candidate.url.toString()));
    if (added.length === 0) return first;
    return { ...first, candidates: interleaved(added, first.candidates), followUpQuery: scoped };
  }

  /**
   * Adds the remaining engines' destinations to the answer.
   *
   * One engine returns about ten unique destinations for a question. Stopping
   * at the first answer left the whole search depending on those ten surviving
   * render, and discarded pages another engine had surfaced: measured across
   * three corpus questions, consulting both engines raises the pool from ten
   * candidates to twenty-five.
   *
   * The pool is capped, because rendering all twenty-five drove Chrome into
   * repeated "WebView closed" failures and cost more results than the wider
   * pool recovered. The extra candidates are a reserve for pages that fail to
   * render, not a larger workload.
   *
   * The engine that answered first still owns the result, so provenance and
   * rank order are unchanged; the later engines only append what is new.
   */
  async #widened(
    first: GoogleDiscoveryResult,
    input: GoogleDiscoveryInput,
  ): Promise<GoogleDiscoveryResult> {
    if (first.status !== "success") return first;
    const answering = this.#engines.findIndex((engine) => engine.name === first.engine);
    const remaining = this.#engines.slice(answering + 1);
    if (remaining.length === 0) return first;
    const seen = new Set(first.candidates.map((candidate) => candidate.url.toString()));
    const added = [];
    const room = Math.max(0, this.#widenedCandidateLimit - first.candidates.length);
    if (room === 0) return first;
    for (const engine of remaining) {
      const result = await engine.discover(input);
      if (result.status !== "success") continue;
      for (const candidate of result.candidates) {
        const key = candidate.url.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        added.push(candidate);
        if (added.length >= room) break;
      }
      if (added.length >= room) break;
    }
    return { ...first, candidates: [...first.candidates, ...added] };
  }

  /**
   * Asks once more with the question's distinctive terms.
   *
   * An engine answers a long question with a site's front page rather than the
   * page the question is about: measured here, a verbose question missed the
   * expected page three times out of three where its first few distinctive
   * terms found it three times out of three.
   *
   * The follow-up is spent only when the first pass left too few candidates to
   * fill the request. Asking unconditionally doubled the pages rendered per
   * search and drove the renderer into repeated "WebView closed" failures,
   * which cost more cases than the extra recall gained.
   *
   * SEARCH-001 forbids rewriting the agent's query, so the authored text is
   * always issued first and unchanged. This is the conditional second pass
   * SEARCH-008 provides for, and the derived query is reported rather than
   * applied silently.
   */
  async #withFollowUp(
    first: GoogleDiscoveryResult,
    input: GoogleDiscoveryInput,
  ): Promise<GoogleDiscoveryResult> {
    if (first.status !== "success" || first.candidates.length >= this.#thinResultCount)
      return first;
    const followUpQuery = keywordFollowUp(input.query);
    if (followUpQuery === undefined) return first;
    const second = await this.#walk({ ...input, query: followUpQuery });
    if (second.status !== "success") return first;
    const seen = new Set(first.candidates.map((candidate) => candidate.url.toString()));
    const added = second.candidates.filter((candidate) => !seen.has(candidate.url.toString()));
    return { ...first, candidates: [...first.candidates, ...added], followUpQuery };
  }

  async #walk(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult> {
    let last: GoogleDiscoveryResult | undefined;
    for (const engine of this.#engines) {
      const result = { ...(await engine.discover(input)), engine: engine.name };
      if (!producedNoAnswer(result.status)) return result;
      last = result;
    }
    return last ?? { status: "blocked", candidates: [], suggestedQueries: [] };
  }
}

/**
 * Merges what a scoped ask found with what the search already had.
 *
 * The ask is spent because the earlier passes did not reach the page the
 * question is about, so its answer leads rather than trailing: appended, it sat
 * last in a pool the renderer only works part-way down, and the page the engine
 * returned for the derived query never appeared in the results.
 *
 * It does not displace them either. Leading with all of it buried the very page
 * the earlier passes had found: on the Bun.WebView question the ask returned
 * five reference pages and pushed `bun.com/docs/runtime/webview` into last
 * place, taking that source recall from 25 to 0. Interleaving keeps both
 * reachable, with the ask first.
 */
function interleaved<Value>(leading: readonly Value[], existing: readonly Value[]): Value[] {
  const merged: Value[] = [];
  for (let index = 0; index < Math.max(leading.length, existing.length); index += 1) {
    const next = leading[index];
    const previous = existing[index];
    if (next !== undefined) merged.push(next);
    if (previous !== undefined) merged.push(previous);
  }
  return merged;
}

/** Release dates named in what the engines returned, outside the URLs themselves. */
function datesIn(texts: readonly string[]): readonly string[] {
  const dates = new Set<string>();
  for (const text of texts)
    for (const match of text.matchAll(/(?:19|20)\d{2}-\d{2}-\d{2}/gu)) dates.add(match[0]);
  return [...dates];
}

function producedNoAnswer(status: GoogleDiscoveryResult["status"]): boolean {
  return status === "blocked" || status === "error";
}
