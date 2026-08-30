import type { EngineName } from "@/features/discovery/domain/engine-names";
import {
  duckduckgoEngine,
  googleEngine,
  type SearchEngine,
} from "@/features/discovery/domain/engines";
import type { Renderer } from "@/features/discovery";

import { ChainedDiscovery, type NamedEngine } from "./chained-discovery.ts";
import { EngineDiscovery } from "./engine-discovery.ts";

/** The engines that have a parser today; the rest arrive in later tickets. */
const implemented: Partial<Record<EngineName, SearchEngine>> = {
  google: googleEngine,
  duckduckgo: duckduckgoEngine,
};

export interface ChainedDiscoveryService extends ChainedDiscovery {
  engineNames(): readonly string[];
}

export function createDiscovery(options: {
  readonly renderer: Renderer;
  readonly engines: readonly EngineName[];
  readonly cooldownMs?: number;
  readonly diagnostic?: (message: string) => void;
}): ChainedDiscoveryService {
  const engines: NamedEngine[] = [];
  for (const name of options.engines) {
    const engine = implemented[name];
    // Skipped rather than fatal, so a default configuration naming an engine
    // whose parser lands later cannot make discovery unavailable. The operator
    // is told, because a shorter chain otherwise looks like engines that never
    // answered.
    if (!engine) {
      options.diagnostic?.(
        `search.engines names ${name}, which has no parser in this build; skipping it`,
      );
      continue;
    }
    engines.push(
      new EngineDiscovery({
        engine,
        renderer: options.renderer,
        cooldownMs: options.cooldownMs,
      }),
    );
  }
  if (engines.length === 0)
    throw new Error(
      `search.engines names no usable engine in this build: ${options.engines.join(", ")}`,
    );
  const chain = new ChainedDiscovery({ engines });
  return Object.assign(chain, {
    engineNames: () => engines.map((engine) => engine.name),
  });
}
