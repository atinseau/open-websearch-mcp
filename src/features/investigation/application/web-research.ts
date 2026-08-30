import { type Candidate, type EngineName, type GoogleDiscoveryService } from "@/features/discovery";

import { discoveryFor, type WebResearchDependencies } from "./web-research-discovery.ts";
import {
  createExtractorRegistry,
  type ExtractionResult,
  type ExtractorRegistry,
} from "@/features/extraction";
import {
  cachedCandidates,
  mergedCandidates,
  prepareCandidate as prepareOneCandidate,
  renderDestination,
  storeRenderedEvidence,
} from "./search-pipeline.ts";
import type { RenderedDocument, Renderer, RenderRequest } from "@/features/rendering";
import { decideRobots, type RobotsPolicy } from "@/features/security";
import { canonicalizeUrl, type Storage } from "@/features/storage";

import { createInvestigationService, type InvestigationService } from "./investigations.ts";
import { startPreparation, type Prepared } from "./search-preparation.ts";
import type {
  CallContext,
  EvidenceResult,
  InvestigationApplication,
  ToolResult,
  WebOpenInput,
  WebSearchInput,
} from "../index.ts";
import {
  empty,
  ExpectedFailure,
  extractionInput,
  pageResult,
  discoveryFailure,
  reasonForRuntimeFailure,
  reasonForExtraction,
  searchResponse,
  success,
  tool,
} from "./web-research-result.ts";

const allowRobots: RobotsPolicy = { canCrawl: async () => true };

export type { WebResearchDependencies };
export function createWebResearchApplication(
  dependencies: WebResearchDependencies,
): InvestigationApplication & { bindWebRuntime(renderer: Renderer): void } {
  return new WebResearchApplication(dependencies);
}

class WebResearchApplication implements InvestigationApplication {
  readonly #storage: Storage;
  readonly #investigations: InvestigationService;
  readonly #extractor: ExtractorRegistry;
  readonly #robots: RobotsPolicy;
  readonly #now: () => Date;
  #renderer: Renderer | undefined;
  #discovery: GoogleDiscoveryService | undefined;
  readonly #engines: readonly EngineName[];
  readonly #diagnostic: ((message: string) => void) | undefined;

  constructor(dependencies: WebResearchDependencies) {
    this.#storage = dependencies.storage;
    this.#investigations = createInvestigationService(dependencies.storage);
    this.#extractor = dependencies.extractor ?? createExtractorRegistry();
    this.#robots = dependencies.robots ?? allowRobots;
    this.#now = dependencies.now ?? (() => new Date());
    this.#renderer = dependencies.renderer;
    this.#engines = dependencies.engines ?? ["google"];
    this.#diagnostic = dependencies.diagnostic;
    this.#discovery =
      dependencies.discovery ??
      (dependencies.renderer ? this.#chainFor(dependencies.renderer) : undefined);
  }

  bindWebRuntime(renderer: Renderer): void {
    this.#renderer = renderer;
    this.#discovery ??= this.#chainFor(renderer);
  }

  #chainFor(renderer: Renderer): GoogleDiscoveryService | undefined {
    return discoveryFor({ renderer, engines: this.#engines, diagnostic: this.#diagnostic });
  }

  async webOpen(input: WebOpenInput, context: CallContext): Promise<ToolResult> {
    const investigation = await this.#investigations.resolve(input.investigationId);
    try {
      return await this.openPrepared(input, context, investigation.id);
    } catch (error) {
      return tool(investigation.id, empty("error", "low", reasonForRuntimeFailure(error)));
    }
  }

  private async openPrepared(
    input: WebOpenInput,
    context: CallContext,
    investigationId: string,
  ): Promise<ToolResult> {
    const result = await this.#investigations.consumePreparedPage({
      investigationId,
      url: input.url,
      signal: context.abortController.signal,
      prepareForEmission: async () => {
        const robots = await decideRobots(
          this.#robots,
          input.url,
          "OpenWebSearchMCP",
          "explicit_open",
        );
        if (robots.ignored)
          await this.#storage.recordRobotsOverride({
            investigationId,
            url: input.url,
            recordedAt: this.#now(),
          });
        const document = await this.render(input.url, context, true);
        const extracted = await this.#extractor.extract(
          extractionInput(document, input.focus, input.maxChars),
        );
        if (extracted.status !== "success")
          throw new ExpectedFailure(reasonForExtraction(extracted));
        // An explicitly opened page is evidence the product has already paid to
        // fetch. Storing it lets a later search answer from cache when Google
        // is unavailable, which is what makes the fallback above useful.
        await this.cache(document, extracted, context);
        return pageResult({
          document,
          extracted,
          discovery: "direct_open",
          sourceType: "other",
          score: 1,
          now: this.#now(),
        });
      },
      resolvedUrl: (response) => canonicalizeUrl(new URL(response.final_url)),
    });
    if (result.state === "consumed")
      return tool(result.investigation.id, success([result.response]));
    if (result.state === "already_consumed")
      return tool(result.investigation.id, empty("no_relevant_results", "low"));
    return tool(result.investigation.id, empty("blocked", "low", "timeout"));
  }

  async webSearch(input: WebSearchInput, context: CallContext): Promise<ToolResult> {
    const investigation = await this.#investigations.resolve(input.investigationId);
    const discovery = this.#discovery;
    if (!discovery) return tool(investigation.id, empty("error", "low", "renderer_unavailable"));
    const discovered = await discovery.discover({
      query: input.query,
      investigationId: investigation.id,
      signal: context.abortController.signal,
      locale: input.locale,
    });
    const unavailable = discoveryFailure(discovered.status, discovered.reason);
    if (unavailable) {
      // SEARCH-011 requires abandoning a blocked source and continuing with the
      // remaining candidates. The local cache is such a candidate: refusing to
      // consult it meant a CAPTCHA at Google discarded evidence the product had
      // already fetched and stored. Google stays best-effort per SEARCH-012;
      // the blocked status is still reported when nothing local can answer.
      const local = await this.cachedOnlySearch(input, context, investigation.id);
      return local ?? tool(investigation.id, unavailable);
    }
    return this.searchCandidates(input, context, investigation.id, discovered);
  }

  /**
   * Answers from stored evidence when discovery is unavailable. Returns
   * undefined when the cache holds nothing for the query, so the caller can
   * report the real discovery failure rather than an empty success.
   */
  private async cachedOnlySearch(
    input: WebSearchInput,
    context: CallContext,
    investigationId: string,
  ): Promise<ToolResult | undefined> {
    const cached = await this.#storage.cache.search(input.query, input.maxResults ?? 5);
    if (cached.results.length === 0) return undefined;
    const results = await this.progressiveCandidates(
      cachedCandidates(cached, input, context),
      input,
      investigationId,
      context,
    );
    if (results.length === 0) return undefined;
    return tool(investigationId, success(results));
  }

  private async searchCandidates(
    input: WebSearchInput,
    context: CallContext,
    investigationId: string,
    discovered: Awaited<ReturnType<GoogleDiscoveryService["discover"]>>,
  ): Promise<ToolResult> {
    const cached = await this.#storage.cache.search(input.query, input.maxResults ?? 5);
    const candidates = mergedCandidates(discovered, cached, input, context);
    const results = await this.progressiveCandidates(candidates, input, investigationId, context);
    return tool(investigationId, searchResponse(investigationId, results, input, discovered));
  }

  private async progressiveCandidates(
    candidates: readonly { readonly candidate: Candidate; readonly score: number }[],
    input: WebSearchInput,
    investigationId: string,
    context: CallContext,
  ): Promise<readonly EvidenceResult[]> {
    const pending = new Map(
      candidates.map((ranked, id) =>
        startPreparation(id, ranked.candidate, ranked.score, context, (candidate, preparation) =>
          this.prepareCandidate(candidate, preparation, input.query),
        ),
      ),
    );
    const results: EvidenceResult[] = [];
    while (
      pending.size &&
      results.length < (input.maxResults ?? 5) &&
      !context.abortController.signal.aborted
    ) {
      const settled = await Promise.race(Array.from(pending.values(), (task) => task.promise));
      pending.delete(settled.id);
      if (!settled.prepared) continue;
      const emitted = await this.consumeSearchPage(
        settled.prepared,
        settled.score,
        investigationId,
        context,
      );
      if (emitted) results.push(emitted);
    }
    for (const task of pending.values()) task.controller.abort(new Error("search_quota_met"));
    return results.sort((a, b) => b.score - a.score);
  }

  private async render(
    url: URL,
    context: CallContext,
    explicitOpen: boolean,
    conditional?: RenderRequest["conditional"],
  ): Promise<RenderedDocument> {
    return renderDestination(this.#renderer, url, context, explicitOpen, conditional);
  }

  private prepareCandidate(
    candidate: Candidate,
    context: CallContext,
    focus?: string,
  ): Promise<Prepared | undefined> {
    return prepareOneCandidate(this.#preparation(), candidate, context, focus);
  }

  #preparation() {
    return {
      storage: this.#storage,
      robots: this.#robots,
      extractor: this.#extractor,
      now: this.#now,
      render: (url: URL, call: CallContext, conditional?: RenderRequest["conditional"]) =>
        this.render(url, call, false, conditional),
    };
  }

  private async consumeSearchPage(
    prepared: Prepared,
    ranked: { readonly score: number } | number | undefined,
    investigationId: string,
    context: CallContext,
  ): Promise<EvidenceResult | undefined> {
    if (ranked === undefined) return undefined;
    const score = typeof ranked === "number" ? ranked : ranked.score;
    const consumed = await this.#investigations.consumePreparedPage({
      investigationId,
      url: prepared.document.url,
      signal: context.abortController.signal,
      prepareForEmission: async () =>
        pageResult({
          document: prepared.document,
          extracted: prepared.extracted,
          discovery: prepared.candidate.sourceType === "local_cache" ? "local_cache" : "google",
          sourceType: prepared.candidate.sourceType,
          score,
          now: this.#now(),
        }),
      resolvedUrl: () => canonicalizeUrl(prepared.document.url),
    });
    return consumed.state === "consumed" ? consumed.response : undefined;
  }

  private async cache(
    document: RenderedDocument,
    extracted: ExtractionResult,
    context: CallContext,
  ): Promise<void> {
    await storeRenderedEvidence(this.#storage, document, extracted, this.#now(), context);
  }
}
