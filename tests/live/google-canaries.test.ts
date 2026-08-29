import { expect, test } from "bun:test";

import {
  createNavigationScheduler,
  createObscuraSupervisor,
  createWebViewRenderer,
  type RendererConfiguration,
} from "@/features/rendering";
import { assessPublicUrl } from "@/features/security";
import { googleCanaryCorpus } from "./google-canary-corpus";

const enabled = Bun.env.OPEN_WEBSEARCH_LIVE === "1";
const executable = Bun.which("obscura") ?? "/Users/arthur/.local/bin/obscura";
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

test.skipIf(!enabled)(
  "TEST-004/018/025 runs serialized Google canaries as an informational report",
  async () => {
    expect(await Bun.file(executable).exists()).toBeTrue();
    const supervisor = createObscuraSupervisor({ executable, configuration });
    const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
    try {
      const endpoint = await supervisor.install(new AbortController().signal);
      const renderer = createWebViewRenderer({
        endpoint,
        configuration,
        scheduler,
        policy: { assess: assessPublicUrl },
      });
      const results: Array<{
        readonly query: string;
        readonly status: "rendered" | "blocked" | "external_error";
        readonly detail: string;
      }> = [];
      for (const query of googleCanaryCorpus) {
        const result = await observe(renderer, query, results.length);
        results.push(result);
        if (result.status === "blocked") break;
        await Bun.sleep(1_500);
      }
      const reportDirectory = Bun.env.BENCHMARK_REPORT_DIR ?? "/tmp/open-websearch-reports";
      await Bun.write(
        `${reportDirectory}/ver-003-live-canaries.json`,
        JSON.stringify(
          {
            schemaVersion: 2,
            informational: true,
            serialized: true,
            stoppedAfterBlock: results.at(-1)?.status === "blocked",
            corpusSize: googleCanaryCorpus.length,
            results,
          },
          null,
          2,
        ) + "\n",
      );
      expect(results.length).toBeGreaterThan(0);
    } finally {
      await scheduler.shutdown();
      await supervisor.shutdown();
    }
  },
  90_000,
);

async function observe(
  renderer: ReturnType<typeof createWebViewRenderer>,
  query: string,
  index: number,
): Promise<{
  readonly query: string;
  readonly status: "rendered" | "blocked" | "external_error";
  readonly detail: string;
}> {
  try {
    const document = await renderer.render({
      url: new URL(`https://www.google.com/search?q=${encodeURIComponent(query)}`),
      signal: new AbortController().signal,
      investigationId: `live-${index}`,
      kind: "google_serp",
      explicitOpen: false,
      profile: "google-public",
    });
    const text = document.text.toLowerCase();
    return {
      query,
      status: text.includes("captcha") || text.includes("unusual traffic") ? "blocked" : "rendered",
      detail: `bytes=${document.diagnostics.transferBytes}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return {
      query,
      status: /captcha|unusual traffic/iu.test(detail) ? "blocked" : "external_error",
      detail,
    };
  }
}
