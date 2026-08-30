import type {
  GoogleDiscoveryInput,
  GoogleDiscoveryResult,
  RenderedDocument,
  Renderer,
} from "@/features/discovery";
import type { SearchEngine } from "@/features/discovery/domain/engines";
import { parseSerp } from "@/features/discovery/domain/serp-parser";

import type { NamedEngine } from "./chained-discovery.ts";

export interface EngineDiscoveryOptions {
  readonly engine: SearchEngine;
  readonly renderer: Renderer;
  readonly cooldownMs?: number;
  readonly now?: () => number;
}

/**
 * Renders one engine's results page and reads it. Every engine is best-effort
 * (SEARCH-012): a refusal is reported as `blocked`, never as an absence of
 * results, so the chain above can tell the two apart.
 */
export class EngineDiscovery implements NamedEngine {
  readonly #engine: SearchEngine;
  readonly #renderer: Renderer;
  readonly #cooldownMs: number;
  readonly #now: () => number;
  #cooldownUntil = 0;

  constructor(options: EngineDiscoveryOptions) {
    this.#engine = options.engine;
    this.#renderer = options.renderer;
    this.#cooldownMs = options.cooldownMs ?? 0;
    this.#now = options.now ?? Date.now;
  }

  get name(): string {
    return this.#engine.name;
  }

  async discover(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult> {
    if (this.#now() < this.#cooldownUntil)
      return { status: "blocked", reason: "cooldown", candidates: [], suggestedQueries: [] };
    try {
      const document = await this.#renderer.render({
        url: this.#engine.searchUrl(input.query, input.locale),
        signal: input.signal,
        investigationId: input.investigationId,
        kind: "google_serp",
        explicitOpen: false,
        profile: "google-public",
      });
      return this.#parsed(document);
    } catch (error) {
      return { status: "error", reason: errorMessage(error), candidates: [], suggestedQueries: [] };
    }
  }

  #parsed(document: RenderedDocument): GoogleDiscoveryResult {
    const parsed = parseSerp(this.#engine, document);
    if (parsed.kind === "parsed")
      return {
        status: "success",
        candidates: parsed.candidates,
        suggestedQueries: parsed.suggestedQueries,
      };
    if (parsed.kind === "empty")
      return { status: "empty", candidates: [], suggestedQueries: parsed.suggestedQueries };
    if (parsed.kind === "blocked") {
      this.#cooldownUntil = this.#now() + this.#cooldownMs;
      return { status: "blocked", reason: parsed.reason, candidates: [], suggestedQueries: [] };
    }
    return {
      status: "parse_failure",
      reason: parsed.diagnostic,
      candidates: [],
      suggestedQueries: [],
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "navigation_failed";
}
