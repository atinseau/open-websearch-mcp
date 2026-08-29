import type {
  GoogleDiscoveryInput,
  GoogleDiscoveryResult,
  GoogleDiscoveryService,
  GoogleProfile,
  RenderedDocument,
  Renderer,
} from "@/features/discovery";
import { parseGoogleSerp } from "@/features/discovery/domain/serp-parser";

export interface GoogleDiscoveryOptions {
  readonly renderer: Renderer;
  readonly baseUrl?: URL;
  readonly cooldownMs?: number;
  readonly now?: () => number;
}

/** Best-effort public Google connector; it has no alternate provider or API path. */
export class GoogleDiscovery implements GoogleDiscoveryService {
  readonly #renderer: Renderer;
  readonly #baseUrl: URL;
  readonly #cooldownMs: number;
  readonly #now: () => number;
  #cooldownUntil = 0;

  constructor(options: GoogleDiscoveryOptions) {
    this.#renderer = options.renderer;
    this.#baseUrl = options.baseUrl ?? new URL("https://www.google.com/search");
    this.#cooldownMs = options.cooldownMs ?? 0;
    this.#now = options.now ?? Date.now;
  }

  profile(): GoogleProfile {
    return { id: "google-public", persistent: true, importsUserCredentials: false };
  }

  async discover(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult> {
    if (this.#now() < this.#cooldownUntil)
      return { status: "blocked", reason: "cooldown", candidates: [], suggestedQueries: [] };
    try {
      const document = await this.#renderer.render({
        url: googleSearchUrl(this.#baseUrl, input.query, input.locale),
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
    const parsed = parseGoogleSerp(document);
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

export function googleSearchUrl(base: URL, query: string, locale?: string): URL {
  const url = new URL(base);
  url.searchParams.set("q", query);
  if (locale && locale !== "auto") url.searchParams.set("hl", locale);
  return url;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "google_navigation_failed";
}
