import { afterAll, expect, test } from "bun:test";

import {
  createNavigationScheduler,
  createObscuraSupervisor,
  createWebViewRenderer,
  type RendererConfiguration,
} from "@/features/rendering";
import { assessPublicUrl } from "@/features/security";

const enabled = Bun.env.OPEN_WEBSEARCH_LIVE === "1";
const executable = Bun.which("obscura") ?? "/Users/arthur/.local/bin/obscura";
const supervisors: ReturnType<typeof createObscuraSupervisor>[] = [];
const configuration: RendererConfiguration = {
  navigationTimeoutMs: 15_000,
  settleTimeoutMs: 250,
  maxDownloadBytes: 2 * 1024 * 1024,
};
const schedulerConfiguration = {
  startCapacity: 1,
  maximumCapacity: 1,
  lastSafeCapacity: 1,
  perHostCapacity: 1,
  googleSerpCapacity: 1,
  safeRssBudgetBytes: 201_326_592,
  warmP95BaselineMs: 456,
  memoryTelemetryAbsentMaximumCapacity: 1,
  growthStep: 1,
  healthyWindowsRequired: 2,
  windowCompletedNavigations: 20,
  minimumWindowMs: 10_000,
  backpressure: {
    errorRate: 0.15,
    timeoutRate: 0.1,
    p95WarmBaselineMultiplier: 2,
    rssSafeBudgetFraction: 0.8,
    action: "halve_ceiling_minimum_1" as const,
  },
};

afterAll(async () => {
  for (const supervisor of supervisors.splice(0)) await supervisor.shutdown();
});

test.skipIf(!enabled)(
  "TEST-004/025 runs two serialized Google canaries as an informational report",
  async () => {
    expect(await Bun.file(executable).exists()).toBeTrue();
    const supervisor = createObscuraSupervisor({ executable, configuration });
    supervisors.push(supervisor);
    const endpoint = await supervisor.install(new AbortController().signal);
    const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
    const renderer = createWebViewRenderer({
      endpoint,
      configuration,
      scheduler,
      policy: { assess: assessPublicUrl },
    });
    const results: Array<{
      readonly query: string;
      readonly status: string;
      readonly detail: string;
    }> = [];
    for (const query of ["Bun WebView documentation", "Model Context Protocol specification"]) {
      try {
        const document = await renderer.render({
          url: new URL(`https://www.google.com/search?q=${encodeURIComponent(query)}`),
          signal: new AbortController().signal,
          investigationId: `live-${results.length}`,
          kind: "google_serp",
          explicitOpen: false,
          profile: "google-public",
        });
        const text = document.text.toLowerCase();
        results.push({
          query,
          status:
            text.includes("captcha") || text.includes("unusual traffic") ? "blocked" : "rendered",
          detail: `bytes=${document.diagnostics.transferBytes}`,
        });
      } catch (error) {
        results.push({
          query,
          status: "external_error",
          detail: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    const reportDirectory = Bun.env.BENCHMARK_REPORT_DIR ?? "/tmp/open-websearch-reports";
    await Bun.write(
      `${reportDirectory}/ver-003-live-canaries.json`,
      JSON.stringify(
        { schemaVersion: 1, informational: true, serialized: true, results },
        null,
        2,
      ) + "\n",
    );
    await scheduler.shutdown();
    expect(results).toHaveLength(2);
  },
  45_000,
);
