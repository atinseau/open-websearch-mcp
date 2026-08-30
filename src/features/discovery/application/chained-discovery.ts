import type {
  GoogleDiscoveryInput,
  GoogleDiscoveryResult,
  GoogleDiscoveryService,
  GoogleProfile,
} from "@/features/discovery";
import { keywordFollowUp } from "@/features/discovery/domain/follow-up-query";

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

  constructor(options: {
    readonly engines: readonly NamedEngine[];
    /** Below this many candidates a long query earns one keyword follow-up. */
    readonly thinResultCount?: number;
  }) {
    if (options.engines.length === 0) throw new Error("discovery requires at least one engine");
    this.#engines = options.engines;
    this.#thinResultCount = options.thinResultCount ?? 6;
  }

  profile(): GoogleProfile {
    return { id: "google-public", persistent: true, importsUserCredentials: false };
  }

  /** Engines are awaited one at a time, which preserves the single-SERP rule. */
  async discover(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult> {
    const first = await this.#walk(input);
    return this.#withFollowUp(first, input);
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

function producedNoAnswer(status: GoogleDiscoveryResult["status"]): boolean {
  return status === "blocked" || status === "error";
}
