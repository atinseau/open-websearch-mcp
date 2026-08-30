import type {
  GoogleDiscoveryInput,
  GoogleDiscoveryResult,
  GoogleDiscoveryService,
  GoogleProfile,
} from "@/features/discovery";

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

  constructor(options: { readonly engines: readonly NamedEngine[] }) {
    if (options.engines.length === 0) throw new Error("discovery requires at least one engine");
    this.#engines = options.engines;
  }

  profile(): GoogleProfile {
    return { id: "google-public", persistent: true, importsUserCredentials: false };
  }

  /** Engines are awaited one at a time, which preserves the single-SERP rule. */
  async discover(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult> {
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
