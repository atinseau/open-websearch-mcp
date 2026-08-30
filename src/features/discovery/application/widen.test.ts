import { expect, test } from "bun:test";

import { ChainedDiscovery } from "./chained-discovery.ts";
import type { GoogleDiscoveryResult } from "@/features/discovery";

const candidate = (url: string) => ({
  url: new URL(url),
  sourceType: "organic" as const,
  title: "t",
});

function engine(name: string, result: GoogleDiscoveryResult) {
  const calls: string[] = [];
  return {
    calls,
    engine: {
      name,
      discover: () => {
        calls.push(name);
        return Promise.resolve(result);
      },
    },
  };
}

function searchInput() {
  return { query: "sqlite fts5", investigationId: "one", signal: new AbortController().signal };
}

test("a second engine widens the candidate pool rather than being left unused", async () => {
  // One engine returns ten unique destinations. Consulting only the first left
  // a page that the second engine did surface unreachable, and left the whole
  // search dependent on ten candidates surviving render.
  const first = engine("duckduckgo", {
    status: "success",
    candidates: [candidate("https://a.test/1"), candidate("https://a.test/2")],
    suggestedQueries: [],
  });
  const second = engine("bing", {
    status: "success",
    candidates: [candidate("https://b.test/3")],
    suggestedQueries: [],
  });
  const discovery = new ChainedDiscovery({ engines: [first.engine, second.engine] });

  const result = await discovery.discover(searchInput());

  expect(result.candidates.map((item) => item.url.toString())).toEqual([
    "https://a.test/1",
    "https://a.test/2",
    "https://b.test/3",
  ]);
});

test("the answering engine is still the one that answered first", async () => {
  const first = engine("duckduckgo", {
    status: "success",
    candidates: [candidate("https://a.test/1")],
    suggestedQueries: [],
  });
  const second = engine("bing", {
    status: "success",
    candidates: [candidate("https://b.test/2")],
    suggestedQueries: [],
  });
  const discovery = new ChainedDiscovery({ engines: [first.engine, second.engine] });

  const result = await discovery.discover(searchInput());

  expect(result.engine).toBe("duckduckgo");
});

test("a duplicate destination is not counted twice", async () => {
  const first = engine("duckduckgo", {
    status: "success",
    candidates: [candidate("https://same.test/x")],
    suggestedQueries: [],
  });
  const second = engine("bing", {
    status: "success",
    candidates: [candidate("https://same.test/x")],
    suggestedQueries: [],
  });
  const discovery = new ChainedDiscovery({ engines: [first.engine, second.engine] });

  const result = await discovery.discover(searchInput());

  expect(result.candidates).toHaveLength(1);
});

test("a blocked second engine leaves the first engine's answer intact", async () => {
  const first = engine("duckduckgo", {
    status: "success",
    candidates: [candidate("https://a.test/1")],
    suggestedQueries: [],
  });
  const second = engine("bing", { status: "blocked", candidates: [], suggestedQueries: [] });
  const discovery = new ChainedDiscovery({ engines: [first.engine, second.engine] });

  const result = await discovery.discover(searchInput());

  expect(result.status).toBe("success");
  expect(result.candidates).toHaveLength(1);
});
