import { expect, test } from "bun:test";

import type { CallContext, InvestigationApplication, ToolResult } from "@/features/investigation";
import { composeMcpTools } from "@/bootstrap";

const configuration = {
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
} as const;

function result(investigationId: string): ToolResult {
  return { investigationId, text: "", structuredContent: {} };
}

function adapterOver(application: InvestigationApplication): ReturnType<typeof composeMcpTools> {
  return composeMcpTools({
    application,
    calls: { create: () => ({ abortController: new AbortController(), configuration }) },
  });
}

test("ORCH-004 concurrent calls never share a call context or its snapshot", async () => {
  const contexts: CallContext[] = [];
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const tools = adapterOver({
    webSearch: async (input, context) => {
      contexts.push(context);
      await gate;
      return result(input.query);
    },
    webOpen: async (_input, context) => {
      contexts.push(context);
      await gate;
      return result("open");
    },
  });

  // Start every call before any of them completes, so the contexts genuinely
  // overlap rather than being reused sequentially.
  const inFlight = [
    tools.webSearch({ query: "first" }),
    tools.webSearch({ query: "second" }),
    tools.webOpen({ url: new URL("https://example.com/") }),
  ];
  release();
  await Promise.all(inFlight);

  expect(contexts).toHaveLength(3);
  expect(new Set(contexts.map((context) => context.abortController)).size).toBe(3);
  for (const context of contexts) {
    expect(context.configuration).toEqual(configuration);
    expect(context.abortController.signal.aborted).toBe(false);
  }
});

test("ORCH-007 cancelling one call leaves concurrent calls untouched", async () => {
  const contexts: CallContext[] = [];
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cancelled = new AbortController();

  const tools = adapterOver({
    webSearch: async (input, context) => {
      contexts.push(context);
      await gate;
      return result(input.query);
    },
    webOpen: async () => result("unused"),
  });

  const first = tools.webSearch({ query: "cancelled" }, cancelled.signal);
  const second = tools.webSearch({ query: "survivor" });
  cancelled.abort("client-cancelled");
  release();
  await Promise.all([first, second]);

  expect(contexts).toHaveLength(2);
  expect(contexts[0]?.abortController.signal.aborted).toBe(true);
  expect(contexts[1]?.abortController.signal.aborted).toBe(false);
});

test("ORCH-007 releases its cancellation listener once a call settles", async () => {
  const client = new AbortController();
  const tools = adapterOver({
    webSearch: async () => result("settled"),
    webOpen: async () => result("unused"),
  });

  const captured: CallContext[] = [];
  const observing = composeMcpTools({
    application: {
      webSearch: async (_input, context) => {
        captured.push(context);
        return result("settled");
      },
      webOpen: async () => result("unused"),
    },
    calls: { create: () => ({ abortController: new AbortController(), configuration }) },
  });

  await observing.webSearch({ query: "settled" }, client.signal);
  // Aborting after the call finished must not reach the completed call's
  // controller, or a long-lived client signal would leak listeners.
  client.abort("late");

  expect(captured[0]?.abortController.signal.aborted).toBe(false);
  await tools.webSearch({ query: "unrelated" });
});
