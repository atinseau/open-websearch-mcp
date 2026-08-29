import { expect, test } from "bun:test";
import { composeMcpTools } from "@/bootstrap";
import type { ConfigurationSnapshot } from "@/features/configuration";
import type { CallContext, InvestigationApplication, ToolResult } from "@/features/investigation";

const configuration: ConfigurationSnapshot = {
  scheduler: {
    startCapacity: 8,
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
      action: "halve_ceiling_minimum_1",
    },
  },
};

function result(investigationId: string): ToolResult {
  return { investigationId, text: "evidence", structuredContent: {} };
}

test("ARCH-001 establishes the feature skeleton and its single public index", () => {
  const featureNames = [
    "configuration",
    "discovery",
    "extraction",
    "investigation",
    "ranking",
    "rendering",
    "security",
    "storage",
  ];
  const root = import.meta.dir.slice(0, -"/tests/architecture".length);

  for (const feature of featureNames) {
    expect(Bun.file(`${root}/src/features/${feature}/index.ts`).size).toBeGreaterThan(0);
  }
});

test("ORCH-002 scheduler configuration preserves the SPK-003 calibrated controller", async () => {
  const root = import.meta.dir.slice(0, -"/tests/architecture".length);
  const fixture: { readonly controller: ConfigurationSnapshot["scheduler"] } = await Bun.file(
    `${root}/docs/spikes/SPK-003/controller-fixture.json`,
  ).json();

  expect(configuration.scheduler).toEqual(fixture.controller);
});

test("MCP calls cross the investigation application seam with one call context each", async () => {
  const contexts: CallContext[] = [];
  const application: InvestigationApplication = {
    webSearch: async (input, context) => {
      contexts.push(context);
      return result(input.investigationId ?? "created-search");
    },
    webOpen: async (input, context) => {
      contexts.push(context);
      return result(input.investigationId ?? "created-open");
    },
  };
  const tools = composeMcpTools({
    application,
    calls: {
      create: () => ({ abortController: new AbortController(), configuration }),
    },
  });

  expect(await tools.webSearch({ query: "Bun WebView", investigationId: "search" })).toEqual(
    result("search"),
  );
  expect(
    await tools.webOpen({ url: new URL("https://example.com"), investigationId: "open" }),
  ).toEqual(result("open"));

  expect(contexts).toHaveLength(2);
  expect(contexts[0]?.configuration).toBe(configuration);
  expect(contexts[1]?.configuration).toBe(configuration);
  expect(contexts[0]?.abortController).not.toBe(contexts[1]?.abortController);
});

test("MCP cancellation reaches the call-owned AbortController", async () => {
  let captured: CallContext | undefined;
  const cancellation = new AbortController();
  const tools = composeMcpTools({
    application: {
      webSearch: async (_input, context) => {
        captured = context;
        return result("cancelled-search");
      },
      webOpen: async () => result("unused"),
    },
    calls: {
      create: () => ({ abortController: new AbortController(), configuration }),
    },
  });

  cancellation.abort("client-cancelled");
  await tools.webSearch({ query: "cancel" }, cancellation.signal);

  expect(captured?.abortController.signal.aborted).toBe(true);
  expect(captured?.abortController.signal.reason).toBe("client-cancelled");
});
