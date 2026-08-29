import { expect, test } from "bun:test";

import { createWebResearchApplication, type CallContext } from "@/features/investigation";
import type { Renderer } from "@/features/rendering";
import { defaultConfiguration } from "@/features/configuration";
import { openStorage } from "@/features/storage";
import { structuredToolResultSchema } from "@/mcp/contracts";
import {
  blockedDiscovery,
  context,
  document,
  fixtureDiscovery,
  renderer,
  workspace,
} from "./web-tools-fixture.ts";

test("CACHE/SECURITY cached evidence avoids rerendering and robots override is durable", async () => {
  let renders = 0;
  const counting: Renderer = {
    render: async (request) => {
      renders++;
      return document(request.url);
    },
  };
  const discovery = fixtureDiscovery(["https://cache.example/needle"]);
  // The robots override and the cache reuse are measured against separate
  // stores. An explicitly opened page is cached, and every fixture body shares
  // the same "needle" text, so one store would let the opened page enter the
  // search as an extra local candidate and mask the render count.
  const robotsStorage = await openStorage({ workspace: workspace() });
  const overridden = createWebResearchApplication({
    storage: robotsStorage,
    renderer: counting,
    robots: { canCrawl: async () => false },
  });
  const opened = structuredToolResultSchema.parse(
    await overridden
      .webOpen({ url: new URL("https://robots.example/open") }, context())
      .then((value) => value.structuredContent),
  );
  expect(await robotsStorage.listRobotsOverrides(opened.investigation_id)).toMatchObject([
    { url: new URL("https://robots.example/open") },
  ]);
  robotsStorage.close();

  const storage = await openStorage({ workspace: workspace() });
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

test("SEARCH-011 answers from stored evidence when Google is blocked", async () => {
  // Google is best-effort (SEARCH-012), but a block must not discard evidence
  // the product already fetched and stored. SEARCH-011 requires continuing with
  // the remaining candidates, and the local cache is one of them.
  const storage = await openStorage({ workspace: workspace() });
  const fixtureRenderer = renderer();
  const seeding = createWebResearchApplication({ storage, renderer: fixtureRenderer });
  await seeding.webOpen({ url: new URL("https://cache.example/needle") }, context());

  const blocked = createWebResearchApplication({
    storage,
    renderer: fixtureRenderer,
    discovery: blockedDiscovery(),
  });
  const result = structuredToolResultSchema.parse(
    await blocked
      .webSearch({ query: "needle", maxResults: 1, investigationId: "blocked-a" }, context())
      .then((value) => value.structuredContent),
  );
  expect(result.status).toBe("success");
  expect(result.results[0]?.discovery).toBe("local_cache");

  // With nothing stored for the query, the real discovery failure is reported
  // rather than an empty success that would hide it.
  const cold = await openStorage({ workspace: workspace() });
  const coldSearch = createWebResearchApplication({
    storage: cold,
    renderer: fixtureRenderer,
    discovery: blockedDiscovery(),
  });
  const reported = structuredToolResultSchema.parse(
    await coldSearch
      .webSearch({ query: "absent", maxResults: 1, investigationId: "blocked-b" }, context())
      .then((value) => value.structuredContent),
  );
  expect(reported.status).toBe("blocked");
  expect(reported.reason).toBe("captcha");
  cold.close();
  storage.close();
});

test("CACHE-005 honours the origin's own cache directives end to end", async () => {
  // The renderer now surfaces the response's cache headers, so freshness follows
  // the origin instead of a content-class TTL guess. A `no-store` page must not
  // reach disk at all, even though its render succeeded.
  const storage = await openStorage({ workspace: workspace() });
  const privateRenderer: Renderer = {
    render: async (request) => ({
      ...document(request.url),
      cacheHeaders: { "cache-control": "no-store", etag: "private" },
    }),
  };
  const application = createWebResearchApplication({ storage, renderer: privateRenderer });
  const opened = structuredToolResultSchema.parse(
    await application
      .webOpen({ url: new URL("https://private.example/session") }, context())
      .then((value) => value.structuredContent),
  );
  expect(opened.status).toBe("success");
  expect((await storage.cache.search("needle", 5)).results).toBeEmpty();

  // A cacheable page is still stored and remains searchable.
  const publicRenderer: Renderer = {
    render: async (request) => ({
      ...document(request.url),
      cacheHeaders: { "cache-control": "max-age=3600" },
    }),
  };
  const second = createWebResearchApplication({ storage, renderer: publicRenderer });
  await second.webOpen({ url: new URL("https://public.example/page") }, context());
  expect((await storage.cache.search("needle", 5)).results.length).toBeGreaterThan(0);
  storage.close();
});

test("CACHE-006 enforces the configured ceiling as pages are stored", async () => {
  // Eviction existed but no product path called it, so the ceiling was never
  // enforced at runtime and the cache could grow without bound.
  const storage = await openStorage({ workspace: workspace() });
  const tiny: CallContext = {
    abortController: new AbortController(),
    configuration: {
      scheduler: context().configuration.scheduler,
      configuration: {
        ...defaultConfiguration,
        cache: { ...defaultConfiguration.cache, max_bytes: 400 },
      },
    },
  };
  const application = createWebResearchApplication({ storage, renderer: renderer() });
  for (const path of ["one", "two", "three", "four"]) {
    await application.webOpen({ url: new URL(`https://bulk.example/${path}`) }, tiny);
  }
  const stored = (await storage.cache.search("needle", 50)).results;
  expect(stored.length).toBeGreaterThan(0);
  expect(stored.length).toBeLessThan(4);
  storage.close();
});
