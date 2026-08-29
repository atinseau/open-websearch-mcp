import { expect, test } from "bun:test";

import {
  analyzeCandidates,
  GoogleDiscovery,
  googleSearchUrl,
  type Candidate,
  type RenderedDocument,
  type Renderer,
} from "@/features/discovery";

type Fixture = {
  readonly text: string;
  readonly links: readonly { readonly url: string; readonly text: string }[];
};

test("SEARCH-001/003/004 preserves the authored query and uses the isolated public Google profile", async () => {
  const renderer = new FixtureRenderer(await fixture("organic"));
  const service = new GoogleDiscovery({ renderer });
  const query = 'site:example.com "exact phrase" -noise filetype:pdf';
  const result = await service.discover(input(query));
  expect(new URL(renderer.requests[0]!.url).searchParams.get("q")).toBe(query);
  expect(service.profile()).toEqual({
    id: "google-public",
    persistent: true,
    importsUserCredentials: false,
  });
  expect(renderer.requests[0]!.kind).toBe("google_serp");
  expect(renderer.requests[0]!.profile).toBe("google-public");
  expect(result.status).toBe("success");
});

test("SEARCH-005/006 normalizes organic and each public module while excluding ads and Google trackers", async () => {
  const organic = await new GoogleDiscovery({
    renderer: new FixtureRenderer(await fixture("organic")),
  }).discover(input("x"));
  expect(organic.candidates).toHaveLength(1);
  expect(organic.candidates[0]!.sourceType).toBe("organic");
  const modules = await new GoogleDiscovery({
    renderer: new FixtureRenderer(await fixture("modules")),
  }).discover(input("x"));
  expect(modules.candidates.map((resultCandidate) => resultCandidate.sourceType)).toEqual([
    "news",
    "discussion",
    "video",
    "academic",
    "document",
    "other",
  ]);
});

test("SEARCH-007 returns at most eight deduplicated suggestions without a navigation", async () => {
  const renderer = new FixtureRenderer(await fixture("suggestions"));
  const result = await new GoogleDiscovery({ renderer }).discover(input("x"));
  expect(result.suggestedQueries).toEqual([
    { query: "Related searches: One question", source: "google_related" },
    { query: "People also ask: Two question", source: "google_question" },
  ]);
  expect(renderer.requests).toHaveLength(1);
});

test("SEARCH-012 distinguishes a blocked Google page from an empty result", async () => {
  const blocked = await new GoogleDiscovery({
    renderer: new FixtureRenderer(await fixture("blocked")),
  }).discover(input("x"));
  const empty = await new GoogleDiscovery({
    renderer: new FixtureRenderer(await fixture("empty")),
  }).discover(input("x"));
  expect(blocked).toMatchObject({ status: "blocked", reason: "captcha" });
  expect(empty).toMatchObject({ status: "empty", candidates: [] });
});

test("SEARCH-009/011/RENDER-008/009 enforce candidate budget, retries, host circuits, and continue elsewhere", async () => {
  const candidates = Array.from({ length: 32 }, (_, index) =>
    candidate(`https://a${index}.example/${index}`),
  );
  const budgeted = await analyzeCandidates(candidates, 50, async () => ({
    status: "success" as const,
  }));
  expect(budgeted).toHaveLength(30);

  const calls: string[] = [];
  const outcomes = new Map<string, ("network_error" | "timeout" | "blocked" | "success")[]>([
    ["retry.example", ["network_error", "success"]],
    ["slow.example", ["timeout", "success"]],
    ["blocked.example", ["blocked"]],
    ["elsewhere.example", ["success"]],
  ]);
  const result = await analyzeCandidates(
    [
      candidate("https://retry.example/a"),
      candidate("https://slow.example/a"),
      candidate("https://blocked.example/a"),
      candidate("https://blocked.example/b"),
      candidate("https://blocked.example/c"),
      candidate("https://elsewhere.example/a"),
    ],
    30,
    async (value, shortTimeout) => {
      calls.push(`${value.url.hostname}:${shortTimeout}`);
      const status = outcomes.get(value.url.hostname)?.shift() ?? "blocked";
      return { status };
    },
  );
  expect(calls).toContain("retry.example:false");
  expect(calls.filter((call) => call === "retry.example:false")).toHaveLength(2);
  expect(calls).toContain("slow.example:true");
  expect(calls.filter((call) => call.startsWith("blocked.example"))).toHaveLength(2);
  expect(
    result.some(
      (entry) =>
        entry.candidate.url.hostname === "elsewhere.example" && entry.attempt.status === "success",
    ),
  ).toBe(true);
});

test("SEARCH-012 surfaces unrecognized markup as a parse failure", async () => {
  const renderer = new FixtureRenderer({ text: "Google changed everything", links: [] });
  const result = await new GoogleDiscovery({ renderer }).discover(input("x"));
  expect(result).toMatchObject({ status: "parse_failure", reason: "unrecognized_serp_markup" });
  expect(googleSearchUrl(new URL("https://www.google.com/search"), "x").pathname).toBe("/search");
});

class FixtureRenderer implements Renderer {
  readonly requests: Parameters<Renderer["render"]>[0][] = [];
  readonly #value: Fixture;
  constructor(value: Fixture) {
    this.#value = value;
  }
  async render(request: Parameters<Renderer["render"]>[0]): Promise<RenderedDocument> {
    this.requests.push(request);
    return {
      url: request.url,
      text: this.#value.text,
      markdown: this.#value.text,
      links: this.#value.links.map((link) => ({ url: new URL(link.url), text: link.text })),
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
function candidate(url: string): Candidate {
  return { url: new URL(url), sourceType: "organic" };
}
async function fixture(name: string): Promise<Fixture> {
  return requireFixture(name);
}
async function requireFixture(name: string): Promise<Fixture> {
  return fixtureValue(await Bun.file(`${import.meta.dir}/fixtures/${name}.json`).json());
}
function fixtureValue(value: unknown): Fixture {
  if (!isRecord(value) || typeof value.text !== "string" || !Array.isArray(value.links))
    throw new Error("invalid_serp_fixture");
  const links = value.links.map(fixtureLink);
  return { text: value.text, links };
}
function fixtureLink(value: unknown): { readonly url: string; readonly text: string } {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.text !== "string")
    throw new Error("invalid_serp_fixture_link");
  return { url: value.url, text: value.text };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
