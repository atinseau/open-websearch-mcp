import { expect, test } from "bun:test";

import { createWebResearchApplication } from "@/features/investigation";
import type { Renderer } from "@/features/rendering";
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
