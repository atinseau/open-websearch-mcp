import { expect, test } from "bun:test";

import { createNavigationScheduler, type NavigationRequest } from "@/features/rendering";

const configuration = {
  startCapacity: 16,
  maximumCapacity: 40,
  lastSafeCapacity: 16,
  perHostCapacity: 2,
  googleSerpCapacity: 1,
  safeRssBudgetBytes: 201_326_592,
  warmP95BaselineMs: 456,
  memoryTelemetryAbsentMaximumCapacity: 16,
  growthStep: 2,
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

function request(index: number, kind: "destination" | "google_serp"): NavigationRequest {
  return {
    investigationId: `load-${index % 8}`,
    host: kind === "google_serp" ? "www.google.com" : `host-${index % 4}.example`,
    kind,
    explicitOpen: false,
    signal: new AbortController().signal,
  };
}

test("VER-003 sustained controller respects the SPK-003 global, per-host, and SERP envelope", async () => {
  const scheduler = createNavigationScheduler({ configuration });
  const activeByHost = new Map<string, number>();
  let active = 0;
  let serpActive = 0;
  let peakActive = 0;
  let peakHost = 0;
  let peakSerp = 0;
  const operations = Array.from({ length: 80 }, (_, index) => {
    const kind = index % 5 === 0 ? "google_serp" : "destination";
    const item = request(index, kind);
    return scheduler.schedule(item, async () => {
      active += 1;
      serpActive += kind === "google_serp" ? 1 : 0;
      const hostActive = (activeByHost.get(item.host) ?? 0) + 1;
      activeByHost.set(item.host, hostActive);
      peakActive = Math.max(peakActive, active);
      peakHost = Math.max(peakHost, hostActive);
      peakSerp = Math.max(peakSerp, serpActive);
      await Bun.sleep(2);
      active -= 1;
      serpActive -= kind === "google_serp" ? 1 : 0;
      activeByHost.set(item.host, hostActive - 1);
      return index;
    });
  });
  expect(await Promise.all(operations)).toHaveLength(80);
  expect(peakActive).toBeLessThanOrEqual(configuration.startCapacity);
  expect(peakHost).toBeLessThanOrEqual(configuration.perHostCapacity);
  expect(peakSerp).toBe(configuration.googleSerpCapacity);
  expect(scheduler.status()).toEqual({ capacity: 16, active: 0, queued: 0 });
  await scheduler.shutdown();
});
