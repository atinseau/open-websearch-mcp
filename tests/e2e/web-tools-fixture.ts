import type { CallContext } from "@/features/investigation";
import type { GoogleDiscoveryService } from "@/features/discovery";
import type { RenderedDocument, Renderer } from "@/features/rendering";

export function context(): CallContext {
  return { abortController: new AbortController(), configuration: { scheduler: scheduler() } };
}
function scheduler() {
  return {
    startCapacity: 1,
    maximumCapacity: 2,
    lastSafeCapacity: 1,
    perHostCapacity: 2,
    googleSerpCapacity: 1,
    safeRssBudgetBytes: 1,
    warmP95BaselineMs: 1,
    memoryTelemetryAbsentMaximumCapacity: 1,
    growthStep: 1,
    healthyWindowsRequired: 1,
    windowCompletedNavigations: 1,
    minimumWindowMs: 1,
    backpressure: {
      errorRate: 1,
      timeoutRate: 1,
      p95WarmBaselineMultiplier: 1,
      rssSafeBudgetFraction: 1,
      action: "halve_ceiling_minimum_1" as const,
    },
  };
}
export function document(url: URL): RenderedDocument {
  return {
    url,
    text: "",
    markdown: "# First\n\nordinary material\n\n# Focus\n\nneedle evidence appears here",
    links: [],
    diagnostics: { title: "Fixture", transferBytes: 1, settledMs: 1 },
  };
}
export function renderer(fail = false): Renderer {
  return {
    render: async (request) => {
      if (fail) throw new Error("render_failure");
      return document(request.url);
    },
  };
}
export function workspace() {
  return `/private/tmp/open-websearch-tools-${crypto.randomUUID()}`;
}

export function fixtureDiscovery(urls: readonly string[]): GoogleDiscoveryService {
  return {
    profile: () => ({ id: "google-public", persistent: true, importsUserCredentials: false }),
    discover: async () => ({
      status: "success",
      candidates: urls.map((url) => ({
        url: new URL(url),
        sourceType: "organic" as const,
        title: "needle",
      })),
      suggestedQueries: [],
    }),
  };
}

/** Discovery that always reports a CAPTCHA, the observed live Google outcome. */
export function blockedDiscovery(): GoogleDiscoveryService {
  return {
    profile: () => ({ id: "google-public", persistent: true, importsUserCredentials: false }),
    discover: async () => ({
      status: "blocked" as const,
      reason: "captcha",
      candidates: [],
      suggestedQueries: [],
    }),
  };
}
