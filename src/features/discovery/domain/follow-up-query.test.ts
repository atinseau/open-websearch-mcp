import { expect, test } from "bun:test";

import { keywordFollowUp } from "./follow-up-query.ts";

test("a long natural-language question yields a keyword follow-up", () => {
  // Engines answer a verbose question with a site's front page. The same
  // question reduced to its distinctive terms reaches the specific page, which
  // is what the agent asked about.
  const follow = keywordFollowUp(
    "What do current official PDF.js sources document about using the generic build outside a browser, extracting page text, and the runtime assumptions that affect Bun compatibility?",
  );

  expect(follow).toBeDefined();
  expect(follow?.split(/\s+/u).length).toBeLessThanOrEqual(4);
  expect(follow?.toLowerCase()).toContain("pdf.js");
});

test("stop words and question scaffolding are dropped, distinctive terms kept", () => {
  const follow = keywordFollowUp(
    "What does the current official Model Context Protocol specification require from a stdio server during initialize and tools/list, including version negotiation and message framing?",
  );

  // The subject survives; the question scaffolding does not.
  expect(follow?.toLowerCase()).toContain("tools/list");
  expect(follow?.toLowerCase()).not.toContain("what");
  expect(follow?.toLowerCase()).not.toContain("does");
  expect(follow?.toLowerCase()).not.toContain("require");
});

test("a query that is already short has no follow-up to make", () => {
  // Reissuing a near-identical query would spend a navigation for nothing.
  expect(keywordFollowUp("sqlite fts5 external content")).toBeUndefined();
});

test("quoted phrases and operators are preserved, because they are the agent's intent", () => {
  const follow = keywordFollowUp(
    'Explain how site:example.com handles "exact phrase" lookups when the documentation is spread over several long pages of reference material',
  );

  expect(follow).toContain("site:example.com");
  expect(follow).toContain('"exact phrase"');
});

test("a non-latin question keeps its distinctive terms", () => {
  const follow = keywordFollowUp(
    "日本語の一次情報と公式仕様を使って、URL の国際化ドメイン名がブラウザーでどのように解析・表示されるか説明してください。",
  );

  expect(follow).toBeDefined();
  expect(follow?.length).toBeLessThan(
    "日本語の一次情報と公式仕様を使って、URL の国際化ドメイン名がブラウザーでどのように解析・表示されるか説明してください。"
      .length,
  );
});
