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

/**
 * The scope answers "which source", not "what to ask it". Pairing it with the
 * verbose question reproduces the very phrasing that made the engine answer
 * with a front page, so the scoped ask asks the sharp terms - measured live,
 * scoping the whole PDF.js question still missed `examples/` where the
 * keywords found it first.
 */
test("the scoped ask carries the sharpened terms, not the verbose question", async () => {
  const site = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [candidate("https://docs.test/"), candidate("https://docs.test/start")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [site.engine] });

  await discovery.discover(searchInput(verbose));

  expect(site.queries).toContain("site:docs.test PDF.js outside extracting runtime");
});

/**
 * A scoped ask is spent because the earlier passes did not reach the page the
 * question is about, so what it finds is the answer to that failure - not an
 * afterthought. Appending its candidates behind everything already found left
 * them last in a pool the renderer only reaches part-way down: measured on the
 * PDF.js question, the engine returns `pdf.js/examples/` for the derived query
 * and it never appeared in the results.
 */
test("what the scoped ask found leads the pool it was spent to fix", async () => {
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

  expect(result.candidates[0]?.url.toString()).toBe("https://docs.test/examples/");
});

/**
 * Leading with everything a scoped ask returned lets it bury the very page the
 * earlier passes had found. Measured on the Bun.WebView question, the scoped
 * ask returned five reference pages and pushed `bun.com/docs/runtime/webview`
 * - the page the corpus asks for, already in hand - into last place, and its
 * source recall fell from 25 to 0.
 *
 * The ask answers a failure, so what it found leads; it does not displace what
 * was already found. Interleaving keeps both reachable.
 */
test("the scoped ask leads without burying what the search already had", async () => {
  const scoped = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [candidate("https://docs.test/"), candidate("https://docs.test/wanted")],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://docs.test/"), candidate("https://docs.test/wanted")],
      suggestedQueries: [],
    },
    "site:docs.test PDF.js outside extracting runtime": {
      status: "success",
      candidates: [
        candidate("https://docs.test/a"),
        candidate("https://docs.test/b"),
        candidate("https://docs.test/c"),
        candidate("https://docs.test/d"),
        candidate("https://docs.test/e"),
      ],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [scoped.engine] });

  const result = await discovery.discover(searchInput(verbose));
  const order = result.candidates.map((item) => item.url.pathname);

  // What the ask found still leads.
  expect(order[0]).toBe("/a");
  // And a page the first pass had is not pushed behind all of it.
  expect(order.indexOf("/wanted")).toBeLessThan(4);
});

test("a search already inside the source spends no scoped ask", async () => {
  // Neither the candidate count nor depth is the signal: what decides is that
  // the source's own pages already include the one the question asks about.
  // `extracting` is one of the question's terms and one page carries it.
  const deep = engine("google", {
    [verbose]: {
      status: "success",
      candidates: [
        candidate("https://docs.test/extracting-page-text"),
        candidate("https://docs.test/reference"),
      ],
      suggestedQueries: [],
    },
    "PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://docs.test/extracting-page-text")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [deep.engine] });

  await discovery.discover(searchInput(verbose));

  expect(deep.queries.some((query) => query.startsWith("site:"))).toBeFalse();
});

/**
 * A scoped ask consults one engine and stops, so its answer is only as reliable
 * as that engine's mood. Measured over four runs of the Model Context Protocol
 * question with an identical derived query, DuckDuckGo returned
 * /specification/2026-07-28/server/tools twice and /specification/draft/... the
 * other two times - same question, same second, different answers - and the
 * case scored 55 or 22.5 accordingly.
 *
 * The first pass already widens across the remaining engines for exactly this
 * reason. The scoped ask, which is spent because the search had not reached the
 * page at all, has more reason to and not less.
 */
test("the scoped ask consults the other engines too", async () => {
  const first = engine("google", {
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
    // This engine answers the scoped ask, but without the page asked about.
    "site:docs.test PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://docs.test/draft")],
      suggestedQueries: [],
    },
  });
  const second = engine("duckduckgo", {
    "site:docs.test PDF.js outside extracting runtime": {
      status: "success",
      candidates: [candidate("https://docs.test/examples/")],
      suggestedQueries: [],
    },
  });
  const discovery = new ChainedDiscovery({ engines: [first.engine, second.engine] });

  const result = await discovery.discover(searchInput(verbose));

  expect(result.candidates.map((item) => item.url.toString())).toContain(
    "https://docs.test/examples/",
  );
});
