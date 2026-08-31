import { expect, test } from "bun:test";

import { ChainedDiscovery } from "./chained-discovery.ts";
import type { GoogleDiscoveryResult } from "@/features/discovery";

const candidate = (url: string) => ({
  url: new URL(url),
  sourceType: "organic" as const,
  title: "t",
});

function engine(name: string, byQuery: Record<string, GoogleDiscoveryResult>) {
  const queries: string[] = [];
  return {
    queries,
    engine: {
      name,
      discover: (input: { query: string }) => {
        queries.push(input.query);
        return Promise.resolve(
          byQuery[input.query] ?? {
            status: "empty" as const,
            candidates: [],
            suggestedQueries: [],
          },
        );
      },
    },
  };
}

function searchInput(query: string) {
  return { query, investigationId: "one", signal: new AbortController().signal };
}

const verbose =
  "What do current official PDF.js sources document about using the generic build outside a browser, extracting page text, and the runtime assumptions?";

/**
 * An engine answers a question about a project with that project's front page,
 * and the page the question is about sits one level in. When the first passes
 * have already agreed on a domain, asking the same terms scoped to it reaches
 * that page.
 */
test("a result that never reached the subject's own pages earns one scoped ask", async () => {
  const scoped = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [candidate("https://docs.test/"), candidate("https://docs.test/start")],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://docs.test/"), candidate("https://docs.test/start")],
      suggestedQueries: [],
    },
    "site:docs.test PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://docs.test/examples/")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [scoped.engine] });

  const result = await discovery.discover(searchInput(verbose));

  expect(result.candidates.map((item) => item.url.toString())).toContain(
    "https://docs.test/examples/",
  );
  // SEARCH-008: the derived query is reported, never applied silently.
  expect(result.followUpQuery).toContain("site:docs.test");
});

test("a search already inside the source spends no scoped ask", async () => {
  // The candidate count is not the signal - ten links to a site's surface is
  // still a surface. Having reached the source's interior pages is.
  const deep = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [
        candidate("https://docs.test/guide/examples/node"),
        candidate("https://docs.test/guide/api/reference"),
      ],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://docs.test/guide/examples/node")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [deep.engine] });

  await discovery.discover(searchInput(verbose));

  expect(deep.queries.some((query) => query.startsWith("site:"))).toBeFalse();
});

test("the agent's query is always issued first, unchanged", async () => {
  // SEARCH-001: no silent rewriting. Whatever else happens, the authored text
  // reaches the engine exactly as written.
  const first = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [candidate("https://a.test/1")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [first.engine] });

  await discovery.discover(searchInput(verbose));

  expect(first.queries[0]).toBe(verbose);
});

test("a thin result triggers one keyword follow-up, and its candidates are merged", async () => {
  // An engine answers a verbose question with a site's front page. The
  // follow-up reaches the specific page, and both sets are kept.
  const thin = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [candidate("https://a.test/front")],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://a.test/examples")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [thin.engine] });

  const result = await discovery.discover(searchInput(verbose));

  expect(thin.queries[1]).toBe("PDF.js outside extracting runtime");
  expect(result.candidates.map((item) => item.url.toString())).toEqual([
    "https://a.test/front",
    "https://a.test/examples",
  ]);
});

test("a long question gets its follow-up however many candidates came back", async () => {
  // An engine answers a verbose question with forty links to a site's front
  // page and its neighbours. Counting candidates made that first pass look
  // rich while the page the agent asked about was absent, so the count is the
  // wrong signal: the length of the question is what predicts the front-page
  // answer.
  const rich = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [
        candidate("https://a.test/1"),
        candidate("https://a.test/2"),
        candidate("https://a.test/3"),
      ],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://a.test/examples")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [rich.engine] });

  const result = await discovery.discover(searchInput(verbose));

  expect(rich.queries[1]).toBe("PDF.js outside extracting runtime");
  expect(result.candidates.map((item) => item.url.toString())).toContain("https://a.test/examples");
});

test("a short query has no follow-up to derive, so nothing extra is requested", async () => {
  const short = engine("google", {
    "sqlite fts5": {
      status: "success",
      candidates: [candidate("https://a.test/1")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [short.engine] });

  await discovery.discover(searchInput("sqlite fts5"));

  expect(short.queries).toEqual(["sqlite fts5"]);
});

test("the follow-up is reported, so the second query is never silent", async () => {
  const thin = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [candidate("https://a.test/front")],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://a.test/examples")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [thin.engine] });

  const result = await discovery.discover(searchInput(verbose));

  expect(result.followUpQuery).toBe("PDF.js outside extracting runtime");
});

test("a duplicate candidate from the follow-up is not repeated", async () => {
  const thin = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [candidate("https://a.test/same")],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://a.test/same")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [thin.engine] });

  const result = await discovery.discover(searchInput(verbose));

  expect(result.candidates).toHaveLength(1);
});
