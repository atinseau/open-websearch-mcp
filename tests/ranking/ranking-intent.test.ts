import { expect, test } from "bun:test";
import { selectPreRenderCandidates, type CandidateRankingInput } from "@/features/ranking";

function candidate(
  path: string,
  changes: Partial<CandidateRankingInput> = {},
): CandidateRankingInput {
  return {
    url: new URL(`https://example.test/${path}`),
    sourceType: "organic",
    title: "deterministic ranking guide",
    snippet: "A deterministic ranking guide.",
    googlePosition: 2,
    isNovel: true,
    content: "deterministic ranking guide with sufficient original source content ".repeat(20),
    headings: ["Deterministic ranking"],
    anchors: ["ranking guide"],
    hasAuthor: true,
    hasCitations: true,
    originalProvenance: true,
    boilerplateRatio: 0,
    extractable: true,
    supported: true,
    ...changes,
  };
}

/**
 * A question asking for what is "current" is asking for the newest version of a
 * versioned source, and documentation sites keep every version live under a
 * dated path. Search engines index the older ones best: measured against
 * modelcontextprotocol.io, discovery returns /specification/2025-03-26/,
 * /2025-06-18/ and /2025-11-25/ while the corpus asks for /2026-07-28/, which
 * the same engines do return when the date is named.
 *
 * The date in a URL is evidence the product already holds. Preferring the newer
 * of two otherwise-equal versions answers what the question asked, and it
 * reorders candidates rather than rewriting the query.
 */
test("RANK-005 a question about the current version prefers the newer dated path", () => {
  const selected = selectPreRenderCandidates(
    [
      candidate("specification/2025-06-18/server/tools", { googlePosition: 1 }),
      candidate("specification/2026-07-28/server/tools", { googlePosition: 4 }),
    ],
    "what does the current specification require",
    "general",
    1,
  );

  expect(selected[0]?.candidate.url.pathname).toContain("2026-07-28");
});

test("RANK-005 a question that did not ask for the current version is left alone", () => {
  // Without that intent the engine's own ordering stands.
  const selected = selectPreRenderCandidates(
    [
      candidate("specification/2025-06-18/server/tools", { googlePosition: 1 }),
      candidate("specification/2026-07-28/server/tools", { googlePosition: 4 }),
    ],
    "what does the specification require",
    "general",
    1,
  );

  expect(selected[0]?.candidate.url.pathname).toContain("2025-06-18");
});

/**
 * A question asking what the "documentation" says is asking for a documentation
 * page, and a site publishes its reference API under a different path than its
 * guides. Measured on the Bun.WebView question, discovery returns
 * `bun.com/reference/bun/WebView/Backend` first and `bun.com/docs/runtime/webview`
 * — the page the corpus cites — second, every run. That costs half the rank
 * component, 7.5 of 15, on a case where the right page was found.
 *
 * The word is in the question and the path is in the URL; nothing else about
 * the two candidates differs enough to separate them.
 */
test("RANK-003 a question about documentation prefers a documentation path", () => {
  const selected = selectPreRenderCandidates(
    [
      candidate("reference/bun/WebView/Backend", {
        googlePosition: 1,
        title: "WebView Backend",
        snippet: "Backend options for Bun.WebView.",
      }),
      candidate("docs/runtime/webview", {
        googlePosition: 2,
        title: "WebView",
        snippet: "Bun.WebView connects to a running browser.",
      }),
    ],
    "according to current official Bun documentation, how does Bun.WebView connect",
    "general",
    1,
  );

  expect(selected[0]?.candidate.url.pathname).toContain("/docs/");
});

test("RANK-003 a question not about documentation earns no documentation bonus", () => {
  const selected = selectPreRenderCandidates(
    [
      candidate("reference/bun/WebView/Backend", {
        googlePosition: 1,
        title: "WebView Backend",
        snippet: "Backend options for Bun.WebView.",
      }),
      candidate("docs/runtime/webview", {
        googlePosition: 2,
        title: "WebView",
        snippet: "Bun.WebView connects to a running browser.",
      }),
    ],
    "how does Bun.WebView connect to a running browser",
    "general",
    2,
  );
  const scoped = selectPreRenderCandidates(
    [
      candidate("reference/bun/WebView/Backend", {
        googlePosition: 1,
        title: "WebView Backend",
        snippet: "Backend options for Bun.WebView.",
      }),
      candidate("docs/runtime/webview", {
        googlePosition: 2,
        title: "WebView",
        snippet: "Bun.WebView connects to a running browser.",
      }),
    ],
    "according to current official Bun documentation, how does Bun.WebView connect to a running browser",
    "general",
    2,
  );

  // The documentation page's own lead is whatever the question's words earn it;
  // naming the documentation adds exactly the bonus and nothing else.
  const gap = (r: readonly { readonly score: number }[]) => r[0]!.score - r[1]!.score;
  expect(gap(scoped)).toBeGreaterThan(gap(selected));
});

/**
 * A versioned documentation site keeps every release live, and an engine
 * returns pages from several of them at once - not always the same page under
 * two versions. Measured on the Model Context Protocol question, one run in
 * five returns `/specification/2025-06-18` and
 * `/specification/2026-07-28/server/tools`: different pages, different releases,
 * and the older one wins on engine position. That run scored 22.5 where its
 * four neighbours scored 82.5.
 *
 * Requiring an identical path around the date was too strict. A question asking
 * for what is current is asking about the newest release of the site, whichever
 * of its pages is on offer.
 */
test("RANK-005 a stale release loses to a newer one even on a different page", () => {
  const selected = selectPreRenderCandidates(
    [
      candidate("specification/2025-06-18", { googlePosition: 1 }),
      candidate("specification/2026-07-28/server/tools", { googlePosition: 9 }),
    ],
    "what does the current specification require during initialize",
    "general",
    1,
  );

  expect(selected[0]?.candidate.url.pathname).toContain("2026-07-28");
});

test("RANK-005 a release on another site is not compared against it", () => {
  // Two sites version independently; the newer date on one says nothing about
  // the other's pages.
  const selected = selectPreRenderCandidates(
    [
      { ...candidate("specification/2025-06-18", { googlePosition: 1 }) },
      {
        ...candidate("archive/2026-07-28/notes", { googlePosition: 9 }),
        url: new URL("https://other.test/archive/2026-07-28/notes"),
      },
    ],
    "what does the current specification require during initialize",
    "general",
    1,
  );

  expect(selected[0]?.candidate.url.hostname).toBe("example.test");
});
