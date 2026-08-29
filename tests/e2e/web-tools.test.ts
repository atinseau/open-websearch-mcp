import { expect, test } from "bun:test";

import { createWebResearchApplication, type CallContext } from "@/features/investigation";
import type { GoogleDiscoveryService } from "@/features/discovery";
import type { RenderedDocument, Renderer } from "@/features/rendering";
import { openStorage } from "@/features/storage";
import { structuredToolResultSchema } from "@/mcp/contracts";

function context(): CallContext {
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
function document(url: URL): RenderedDocument {
  return {
    url,
    text: "",
    markdown: "# First\n\nordinary material\n\n# Focus\n\nneedle evidence appears here",
    links: [],
    diagnostics: { title: "Fixture", transferBytes: 1, settledMs: 1 },
  };
}
function renderer(fail = false): Renderer {
  return {
    render: async (request) => {
      if (fail) throw new Error("render_failure");
      return document(request.url);
    },
  };
}
function workspace() {
  return `/private/tmp/open-websearch-tools-${crypto.randomUUID()}`;
}

test("TOOL-001 emits a focused page once and failures do not consume it", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const application = createWebResearchApplication({ storage, renderer: renderer() });
  const first = await application.webOpen(
    { url: new URL("https://example.com/page"), focus: "needle" },
    context(),
  );
  const structured = structuredToolResultSchema.parse(first.structuredContent);
  expect(structured.results[0]?.passages[0]?.heading).toBe("Focus");
  const repeated = await application.webOpen(
    { url: new URL("https://example.com/page"), investigationId: structured.investigation_id },
    context(),
  );
  expect(structuredToolResultSchema.parse(repeated.structuredContent).results).toHaveLength(0);
  const failing = createWebResearchApplication({ storage, renderer: renderer(true) });
  const failed = await failing.webOpen(
    { url: new URL("https://example.com/failure"), investigationId: structured.investigation_id },
    context(),
  );
  expect(structuredToolResultSchema.parse(failed.structuredContent).status).toBe("error");
  const recovered = await application.webOpen(
    { url: new URL("https://example.com/failure"), investigationId: structured.investigation_id },
    context(),
  );
  expect(structuredToolResultSchema.parse(recovered.structuredContent).results).toHaveLength(1);
  storage.close();
});

test("TOOL-002 ranks discovered evidence and excludes consumed destinations", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const discovery: GoogleDiscoveryService = {
    profile: () => ({ id: "google-public", persistent: true, importsUserCredentials: false }),
    discover: async () => ({
      status: "success",
      candidates: [
        { url: new URL("https://example.com/a"), sourceType: "organic", title: "needle" },
        { url: new URL("https://example.org/b"), sourceType: "organic", title: "needle" },
      ],
      suggestedQueries: [],
    }),
  };
  const application = createWebResearchApplication({ storage, renderer: renderer(), discovery });
  const first = await application.webSearch({ query: "needle", maxResults: 2 }, context());
  const result = structuredToolResultSchema.parse(first.structuredContent);
  expect(result.results).toHaveLength(2);
  expect(result.results.every((item) => item.discovery === "google")).toBeTrue();
  const repeated = await application.webSearch(
    { query: "needle", maxResults: 2, investigationId: result.investigation_id },
    context(),
  );
  expect(structuredToolResultSchema.parse(repeated.structuredContent).results).toHaveLength(0);
  storage.close();
});

test("TOOL-002 returns a fast page before a slow candidate settles", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const discovery = fixtureDiscovery([
    "https://fast.example/needle",
    "https://slow.example/needle",
  ]);
  const delayed: Renderer = {
    render: async (request) => {
      if (request.url.hostname === "slow.example")
        await new Promise((resolve) => setTimeout(resolve, 500));
      return document(request.url);
    },
  };
  const application = createWebResearchApplication({ storage, renderer: delayed, discovery });
  const started = performance.now();
  const result = structuredToolResultSchema.parse(
    await application
      .webSearch({ query: "needle", maxResults: 1 }, context())
      .then((value) => value.structuredContent),
  );
  expect(performance.now() - started).toBeLessThan(400);
  expect(result.results).toHaveLength(1);
  storage.close();
});

test("CACHE/SECURITY cached evidence avoids rerendering and robots override is durable", async () => {
  const storage = await openStorage({ workspace: workspace() });
  let renders = 0;
  const counting: Renderer = {
    render: async (request) => {
      renders++;
      return document(request.url);
    },
  };
  const discovery = fixtureDiscovery(["https://cache.example/needle"]);
  const overridden = createWebResearchApplication({
    storage,
    renderer: counting,
    robots: { canCrawl: async () => false },
  });
  const opened = structuredToolResultSchema.parse(
    await overridden
      .webOpen({ url: new URL("https://robots.example/open") }, context())
      .then((value) => value.structuredContent),
  );
  expect(await storage.listRobotsOverrides(opened.investigation_id)).toMatchObject([
    { url: new URL("https://robots.example/open") },
  ]);
  const application = createWebResearchApplication({ storage, renderer: counting, discovery });
  await application.webSearch(
    { query: "needle", maxResults: 1, investigationId: "cache-a" },
    context(),
  );
  const before = renders;
  const cached = structuredToolResultSchema.parse(
    await application
      .webSearch({ query: "needle", maxResults: 1, investigationId: "cache-b" }, context())
      .then((value) => value.structuredContent),
  );
  expect(renders).toBe(before);
  expect(cached.results[0]?.discovery).toBe("local_cache");
  storage.close();
});

test("CACHE expired evidence revalidates through the renderer", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const url = new URL("https://expired.example/needle");
  const body = await storage.blobs.put("needle old evidence");
  await storage.cache.put({
    url,
    body,
    contentClass: "general",
    bodyKind: "rendered",
    fetchedAt: new Date(Date.now() - 172_800_000),
    mainContent: "needle old evidence",
  });
  let renders = 0;
  const application = createWebResearchApplication({
    storage,
    renderer: {
      render: async (request) => {
        renders++;
        return document(request.url);
      },
    },
    discovery: fixtureDiscovery([]),
  });
  await application.webSearch({ query: "needle", maxResults: 1 }, context());
  expect(renders).toBe(1);
  storage.close();
});

test("PROD-007 concurrent progressive searches emit a page once", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const application = createWebResearchApplication({
    storage,
    renderer: renderer(),
    discovery: fixtureDiscovery(["https://once.example/needle"]),
  });
  const calls = await Promise.all([
    application.webSearch({ query: "needle", maxResults: 1, investigationId: "shared" }, context()),
    application.webSearch({ query: "needle", maxResults: 1, investigationId: "shared" }, context()),
  ]);
  const emitted = calls.flatMap(
    (call) => structuredToolResultSchema.parse(call.structuredContent).results,
  );
  expect(emitted).toHaveLength(1);
  storage.close();
});

test("PROD-007 reserves the canonical resolved identity for redirect aliases", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const final = new URL("https://example.com/evidence/?utm_source=search");
  const application = createWebResearchApplication({
    storage,
    renderer: { render: async () => document(final) },
    discovery: fixtureDiscovery([
      "https://example.com/redirect-a",
      "https://example.com/redirect-b",
    ]),
  });
  const result = structuredToolResultSchema.parse(
    await application
      .webSearch({ query: "needle", maxResults: 2, investigationId: "redirect-aliases" }, context())
      .then((value) => value.structuredContent),
  );
  expect(result.results).toHaveLength(1);
  expect(result.results[0]?.final_url).toBe("https://example.com/evidence/?utm_source=search");
  const redirectedOpen = await application.webOpen(
    { url: new URL("https://example.com/another-alias"), investigationId: "redirect-aliases" },
    context(),
  );
  expect(structuredToolResultSchema.parse(redirectedOpen.structuredContent).results).toHaveLength(
    0,
  );
  storage.close();
});

test("TOOL-002 aborts outstanding candidate preparation once the quota is met", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const slowStarted = Promise.withResolvers<void>();
  const slowAborted = Promise.withResolvers<void>();
  const application = createWebResearchApplication({
    storage,
    discovery: fixtureDiscovery(["https://fast.example/needle", "https://slow.example/needle"]),
    renderer: {
      render: async (request) => {
        if (request.url.hostname === "fast.example") return document(request.url);
        slowStarted.resolve();
        await new Promise<void>((_resolve, reject) =>
          request.signal.addEventListener("abort", () => {
            slowAborted.resolve();
            reject(request.signal.reason);
          }),
        );
        return document(request.url);
      },
    },
  });
  const response = await application.webSearch({ query: "needle", maxResults: 1 }, context());
  await slowStarted.promise;
  expect(structuredToolResultSchema.parse(response.structuredContent).results).toHaveLength(1);
  await slowAborted.promise;
  storage.close();
});

function fixtureDiscovery(urls: readonly string[]): GoogleDiscoveryService {
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
