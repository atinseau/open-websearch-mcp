import { expect, test } from "bun:test";

import { createWebResearchApplication } from "@/features/investigation";
import type { GoogleDiscoveryService } from "@/features/discovery";
import type { Renderer } from "@/features/rendering";
import { openStorage } from "@/features/storage";
import { structuredToolResultSchema } from "@/mcp/contracts";
import { context, document, fixtureDiscovery, renderer, workspace } from "./web-tools-fixture.ts";

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

test("SEARCH a long page is extracted for the query, not for its opening section", async () => {
  // A search over a large specification returned its introduction, because
  // passage selection was given no idea what had been asked. The extractor
  // already scores passages against a focus; a search never supplied one.
  const storage = await openStorage({ workspace: workspace() });
  const longPage: Renderer = {
    render: async (request) => ({
      url: request.url,
      text: "",
      markdown: [
        "# Introduction",
        "boilerplate ".repeat(200),
        "# Path state",
        `single-dot path segment removal and validation error reporting. ${"detail ".repeat(150)}`,
        "# Acknowledgements",
        "thanks ".repeat(200),
      ].join("\n\n"),
      links: [],
      diagnostics: { title: "Spec", transferBytes: 1, settledMs: 1 },
    }),
  };
  const application = createWebResearchApplication({
    storage,
    renderer: longPage,
    discovery: fixtureDiscovery(["https://url.spec.test/"]),
  });

  const outcome = await application.webSearch(
    { query: "single-dot path segment validation error", maxResults: 1 },
    context(),
  );

  const parsed = structuredToolResultSchema.parse(outcome.structuredContent);
  const text = parsed.results
    .flatMap((item) => item.passages.map((passage) => passage.text))
    .join("\n")
    .toLowerCase();
  expect(text).toContain("single-dot path segment");
  storage.close();
});
