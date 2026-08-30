import { expect, test } from "bun:test";

import {
  createDiscovery,
  EngineDiscovery,
  type RenderedDocument,
  type Renderer,
} from "@/features/discovery";
import { bingEngine } from "@/features/discovery/domain/engines";

type Fixture = {
  readonly text: string;
  readonly links: readonly { readonly url: string; readonly text: string }[];
};

test("with Google and DuckDuckGo both blocked, a search returns Bing results", async () => {
  const renderer = new RoutingRenderer({
    "www.google.com": await fixture("blocked"),
    "html.duckduckgo.com": await fixture("duckduckgo-blocked"),
    "www.bing.com": await fixture("bing-organic"),
  });
  const discovery = createDiscovery({
    renderer,
    engines: ["google", "duckduckgo", "bing"],
  });

  const result = await discovery.discover(input("sqlite fts5"));

  expect(result.status).toBe("success");
  expect(result.engine).toBe("bing");
});

test("a Bing result URL is decoded from its base64 redirect wrapper", async () => {
  // Bing carries the destination base64url-encoded behind an "a1" marker,
  // unlike Google and DuckDuckGo which pass it as a plain parameter.
  const renderer = new RoutingRenderer({ "www.bing.com": await fixture("bing-organic") });

  const result = await new EngineDiscovery({ engine: bingEngine, renderer }).discover(
    input("sqlite fts5"),
  );

  expect(result.candidates.map((candidate) => candidate.url.toString())).toContain(
    "https://sqlite.org/fts5.html",
  );
});

test("a wrapper carrying a relative Bing path is not a candidate", async () => {
  const renderer = new RoutingRenderer({ "www.bing.com": await fixture("bing-organic") });

  const result = await new EngineDiscovery({ engine: bingEngine, renderer }).discover(
    input("sqlite fts5"),
  );

  const hosts = result.candidates.map((candidate) => candidate.url.hostname);
  expect(hosts.some((host) => host.includes("bing.com"))).toBe(false);
});

test("advertisements are excluded exactly as they are for the other engines", async () => {
  const renderer = new RoutingRenderer({ "www.bing.com": await fixture("bing-organic") });

  const result = await new EngineDiscovery({ engine: bingEngine, renderer }).discover(
    input("sqlite fts5"),
  );

  expect(result.candidates.map((candidate) => candidate.url.hostname)).not.toContain("ads.example");
});

test("source typing produces the same categories as the other engines", async () => {
  const renderer = new RoutingRenderer({ "www.bing.com": await fixture("bing-organic") });

  const result = await new EngineDiscovery({ engine: bingEngine, renderer }).discover(
    input("sqlite fts5"),
  );

  expect(result.candidates.map((candidate) => candidate.sourceType)).toContain("news");
});

test("a Bing bot challenge is reported as blocked, not as an absence of results", async () => {
  const renderer = new RoutingRenderer({ "www.bing.com": await fixture("bing-blocked") });

  const result = await new EngineDiscovery({ engine: bingEngine, renderer }).discover(input("x"));

  expect(result.status).toBe("blocked");
});

test("exhausting all three engines reports blocked, naming the last refusal", async () => {
  const renderer = new RoutingRenderer({
    "www.google.com": await fixture("blocked"),
    "html.duckduckgo.com": await fixture("duckduckgo-blocked"),
    "www.bing.com": await fixture("bing-blocked"),
  });
  const discovery = createDiscovery({ renderer, engines: ["google", "duckduckgo", "bing"] });

  const result = await discovery.discover(input("x"));

  expect(result.status).toBe("blocked");
  expect(result.engine).toBe("bing");
  expect(renderer.hosts).toEqual(["www.google.com", "html.duckduckgo.com", "www.bing.com"]);
});

class RoutingRenderer implements Renderer {
  readonly hosts: string[] = [];
  readonly #byHost: Record<string, Fixture>;
  constructor(byHost: Record<string, Fixture>) {
    this.#byHost = byHost;
  }
  async render(request: Parameters<Renderer["render"]>[0]): Promise<RenderedDocument> {
    this.hosts.push(request.url.hostname);
    const value = this.#byHost[request.url.hostname];
    if (!value) throw new Error(`no fixture for ${request.url.hostname}`);
    return {
      url: request.url,
      text: value.text,
      markdown: value.text,
      links: value.links.map((link) => ({ url: new URL(link.url), text: link.text })),
      diagnostics: { title: "fixture", transferBytes: 0, settledMs: 0 },
    };
  }
}

function input(query: string) {
  return {
    query,
    investigationId: "fixture-investigation",
    signal: new AbortController().signal,
  } as const;
}
async function fixture(name: string): Promise<Fixture> {
  const value: unknown = await Bun.file(`${import.meta.dir}/fixtures/${name}.json`).json();
  if (typeof value !== "object" || value === null) throw new Error("invalid_serp_fixture");
  const record: Record<string, unknown> = { ...value };
  if (typeof record.text !== "string" || !Array.isArray(record.links))
    throw new Error("invalid_serp_fixture");
  return { text: record.text, links: record.links.map(fixtureLink) };
}
function fixtureLink(value: unknown): { readonly url: string; readonly text: string } {
  if (typeof value !== "object" || value === null) throw new Error("invalid_serp_fixture_link");
  const record: Record<string, unknown> = { ...value };
  if (typeof record.url !== "string" || typeof record.text !== "string")
    throw new Error("invalid_serp_fixture_link");
  return { url: record.url, text: record.text };
}
