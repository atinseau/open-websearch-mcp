import {
  createDiscovery,
  type EngineName,
  type GoogleDiscoveryService,
  type Renderer,
} from "@/features/discovery";
import type { ExtractorRegistry } from "@/features/extraction";
import type { RobotsPolicy } from "@/features/security";
import type { Storage } from "@/features/storage";

export interface WebResearchDependencies {
  readonly storage: Storage;
  readonly renderer?: Renderer;
  readonly discovery?: GoogleDiscoveryService;
  readonly extractor?: ExtractorRegistry;
  readonly robots?: RobotsPolicy;
  readonly now?: () => Date;
  /** Engine order from configuration; defaults to Google alone. */
  readonly engines?: readonly EngineName[];
  readonly diagnostic?: (message: string) => void;
}

/**
 * Builds the discovery chain an investigation uses, from the configured engine
 * order. Kept beside the application rather than inside it so the application
 * file stays about investigating rather than about wiring.
 */
export function discoveryFor(options: {
  readonly renderer: Renderer | undefined;
  readonly engines: readonly EngineName[];
  readonly diagnostic: ((message: string) => void) | undefined;
}): GoogleDiscoveryService | undefined {
  if (!options.renderer) return undefined;
  return createDiscovery({
    renderer: options.renderer,
    engines: options.engines,
    diagnostic: options.diagnostic,
  });
}
