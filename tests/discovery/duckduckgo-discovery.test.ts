import { expect, test } from "bun:test";

import {
  createDiscovery,
  EngineDiscovery,
  type RenderedDocument,
  type Renderer,
} from "@/features/discovery";
import { duckduckgoEngine } from "@/features/discovery/domain/engines";

type Fixture = {
  readonly text: string;
  readonly links: readonly { readonly url: string; readonly text: string }[];
};

test("a blocked Google search comes back with DuckDuckGo results", async () => {
  const renderer = new RoutingRenderer({
    "www.google.com": await fixture("blocked"),
    "html.duckduckgo.com": await fixture("duckduckgo-organic"),
  });
  const discovery = createDiscovery({
    renderer,
    engines: ["google", "duckduckgo"],
  });

  const result = await discovery.discover(input("bun webview"));

  expect(result.status).toBe("success");
  expect(result.engine).toBe("duckduckgo");
  expect(result.candidates.length).toBeGreaterThan(0);
});

test("a DuckDuckGo result URL is the real destination, not its redirect wrapper", async () => {
  const renderer = new RoutingRenderer({
    "html.duckduckgo.com": await fixture("duckduckgo-organic"),
  });

  const result = await new EngineDiscovery({ engine: duckduckgoEngine, renderer }).discover(
    input("bun webview"),
  );

  expect(result.candidates.map((candidate) => candidate.url.toString())).toContain(
    "https://bun.com/docs/runtime/webview",
  );
});

test("advertisements and DuckDuckGo's own pages are not candidates", async () => {
  const renderer = new RoutingRenderer({
    "html.duckduckgo.com": await fixture("duckduckgo-organic"),
  });

  const result = await new EngineDiscovery({ engine: duckduckgoEngine, renderer }).discover(
    input("bun webview"),
  );

  const hosts = result.candidates.map((candidate) => candidate.url.hostname);
  expect(hosts).not.toContain("ads.example");
  expect(hosts.some((host) => host.includes("duckduckgo"))).toBe(false);
});

test("source typing works the same way it does for Google", async () => {
  const renderer = new RoutingRenderer({
    "html.duckduckgo.com": await fixture("duckduckgo-organic"),
  });

  const result = await new EngineDiscovery({ engine: duckduckgoEngine, renderer }).discover(
    input("bun webview"),
  );

  expect(result.candidates.map((candidate) => candidate.sourceType)).toContain("news");
});

test("a blocked DuckDuckGo page is reported as blocked, not as an absence of results", async () => {
  const renderer = new RoutingRenderer({
    "html.duckduckgo.com": await fixture("duckduckgo-blocked"),
  });

  const result = await new EngineDiscovery({ engine: duckduckgoEngine, renderer }).discover(
    input("x"),
  );

  expect(result.status).toBe("blocked");
});

test("removing DuckDuckGo from the configured engines stops it being consulted", async () => {
  const renderer = new RoutingRenderer({
    "www.google.com": await fixture("blocked"),
    "html.duckduckgo.com": await fixture("duckduckgo-organic"),
  });
  const discovery = createDiscovery({ renderer, engines: ["google"] });

  const result = await discovery.discover(input("bun webview"));

  expect(result.status).toBe("blocked");
  expect(renderer.hosts).toEqual(["www.google.com"]);
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
