import { GoogleDiscovery, type Candidate, type GoogleDiscoveryService } from "@/features/discovery";
import {
  createExtractorRegistry,
  type ExtractionResult,
  type ExtractorRegistry,
} from "@/features/extraction";
import { selectPreRenderCandidates } from "@/features/ranking";
import type { RenderedDocument, Renderer } from "@/features/rendering";
import { decideRobots, type RobotsPolicy } from "@/features/security";
import type { Storage } from "@/features/storage";

import { createInvestigationService, type InvestigationService } from "./investigations.ts";
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
  cachedPrepared,
  cacheRead,
  pageResult,
  discoveryFailure,
  reasonForExtraction,
  searchResponse,
  success,
  tool,
} from "./web-research-result.ts";

const allowRobots: RobotsPolicy = { canCrawl: async () => true };

export interface WebResearchDependencies {
  readonly storage: Storage;
  readonly renderer?: Renderer;
  readonly discovery?: GoogleDiscoveryService;
  readonly extractor?: ExtractorRegistry;
  readonly robots?: RobotsPolicy;
  readonly now?: () => Date;
}

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

  constructor(dependencies: WebResearchDependencies) {
    this.#storage = dependencies.storage;
    this.#investigations = createInvestigationService(dependencies.storage);
    this.#extractor = dependencies.extractor ?? createExtractorRegistry();
    this.#robots = dependencies.robots ?? allowRobots;
    this.#now = dependencies.now ?? (() => new Date());
    this.#renderer = dependencies.renderer;
    this.#discovery =
      dependencies.discovery ??
      (dependencies.renderer
        ? new GoogleDiscovery({ renderer: dependencies.renderer })
        : undefined);
  }

  bindWebRuntime(renderer: Renderer): void {
    this.#renderer = renderer;
    this.#discovery ??= new GoogleDiscovery({ renderer });
  }

  async webOpen(input: WebOpenInput, context: CallContext): Promise<ToolResult> {
    const investigation = await this.#investigations.resolve(input.investigationId);
    try {
      return await this.openPrepared(input, context, investigation.id);
    } catch (error) {
      return tool(
        investigation.id,
        empty("error", "low", error instanceof ExpectedFailure ? error.reason : "network_error"),
      );
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
        return pageResult({
          document,
          extracted,
          discovery: "direct_open",
          sourceType: "other",
          score: 1,
          now: this.#now(),
        });
      },
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
    if (unavailable) return tool(investigation.id, unavailable);
    return this.searchCandidates(input, context, investigation.id, discovered);
  }

  private async searchCandidates(
    input: WebSearchInput,
    context: CallContext,
    investigationId: string,
    discovered: Awaited<ReturnType<GoogleDiscoveryService["discover"]>>,
  ): Promise<ToolResult> {
    const cached = await this.#storage.cache.search(input.query, input.maxResults ?? 5);
    const cachedUrls = new Set(cached.results.map((item) => item.document.url.href));
    const candidates = selectPreRenderCandidates(
      [
        ...discovered.candidates.filter((candidate) => !cachedUrls.has(candidate.url.href)),
        ...cached.results.map((item) => ({
          url: item.document.url,
          sourceType: "local_cache" as const,
          title: item.document.url.hostname,
        })),
      ].map((candidate, index) => ({
        ...candidate,
        googlePosition: index + 1,
      })),
      input.query,
      input.profile,
      context.configuration.configuration?.search.candidate_budget ?? 30,
    );
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
      candidates.map((ranked, id) => [
        id,
        this.prepareCandidate(ranked.candidate, context).then((prepared) => ({
          id,
          prepared,
          score: ranked.score,
        })),
      ]),
    );
    const results: EvidenceResult[] = [];
    while (
      pending.size &&
      results.length < (input.maxResults ?? 5) &&
      !context.abortController.signal.aborted
    ) {
      const settled = await Promise.race(pending.values());
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
    return results.sort((a, b) => b.score - a.score);
  }

  private async render(
    url: URL,
    context: CallContext,
    explicitOpen: boolean,
  ): Promise<RenderedDocument> {
    if (!this.#renderer) throw new ExpectedFailure("renderer_unavailable");
    return this.#renderer.render({
      url,
      signal: context.abortController.signal,
      investigationId: "pending",
      kind: "destination",
      explicitOpen,
    });
  }

  private async prepareCandidate(
    candidate: Candidate,
    context: CallContext,
  ): Promise<Prepared | undefined> {
    const robots = await decideRobots(
      this.#robots,
      candidate.url,
      "OpenWebSearchMCP",
      "automatic_search",
    );
    if (!robots.allowed) return undefined;
    try {
      const cached =
        candidate.sourceType === "local_cache"
          ? await this.#storage.cache.get(candidate.url, cacheRead(this.#now()))
          : undefined;
      if (cached?.fresh && cached.document.mainContent)
        return cachedPrepared(candidate, cached.document.mainContent);
      const document = await this.render(candidate.url, context, false);
      const extracted = await this.#extractor.extract(extractionInput(document));
      if (extracted.status !== "success") return undefined;
      await this.cache(document, extracted);
      return { candidate, document, extracted };
    } catch {
      return undefined;
    }
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
    });
    return consumed.state === "consumed" ? consumed.response : undefined;
  }

  private async cache(document: RenderedDocument, extracted: ExtractionResult): Promise<void> {
    const body = await this.#storage.blobs.put(document.markdown);
    await this.#storage.cache.put({
      url: document.url,
      body,
      contentClass: "general",
      bodyKind: "rendered",
      fetchedAt: this.#now(),
      mainContent: extracted.passages.map((passage) => passage.text).join("\n"),
    });
  }
}
interface Prepared {
  readonly candidate: Candidate;
  readonly document: RenderedDocument;
  readonly extracted: ExtractionResult;
}
