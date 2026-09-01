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

/**
 * Keeping the first few surviving words takes whatever the sentence happened to
 * say early, and ordinary vocabulary carries no subject. Measured live, the
 * PDF.js question produced "official PDF.js document generic", and "document"
 * pulled French dictionary and clinic pages into the results, which then spent
 * places the real documentation needed.
 */
test("a follow-up keeps the terms that identify a subject, not ordinary words", () => {
  const follow = keywordFollowUp(
    "What do current official PDF.js sources document about using the generic build outside a browser, extracting page text, and rendering a page to a canvas?",
  );

  expect(follow?.toLowerCase()).toContain("pdf.js");
  // "document" and "generic" say nothing about the subject and match anything.
  expect(follow?.toLowerCase()).not.toContain("document");
  expect(follow?.toLowerCase()).not.toContain("generic");
});

test("an identifier outranks a plain word, whatever order they appeared in", () => {
  const follow = keywordFollowUp(
    "What does the current official Model Context Protocol specification require from a stdio server during initialize and tools/list, including version negotiation and message framing?",
  );

  // `tools/list` and `stdio` name the subject; "official" describes nothing.
  expect(follow?.toLowerCase()).toContain("tools/list");
  expect(follow?.toLowerCase()).not.toContain("official");
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

/**
 * The words a question uses to frame itself name no subject in any language.
 *
 * `genericWords` exists because "documentation" or "official" match anything
 * an engine indexes, and it is spelled in English only. The corpus's Japanese
 * question opens by asking for 一次情報 (primary sources) and 公式仕様
 * (official specification) - exactly that kind of framing - and those words
 * are what the follow-up kept.
 *
 * Measured live, the derived query was 日本語 一次 情報 公式, which names
 * "Japanese primary information official" and nothing the question is about.
 * The subject it dropped - URL, ドメイン, 国際 - is what an engine needs to
 * find the specifications the question asks for.
 */
test("framing words name no subject in Japanese either", () => {
  const follow = keywordFollowUp(
    "日本語の一次情報と公式仕様を使って、URL の国際化ドメイン名がブラウザーでどのように解析・表示されるか説明してください。",
  );

  expect(follow).toContain("URL");
  expect(follow).toContain("ドメイン");
  expect(follow).not.toContain("一次");
  expect(follow).not.toContain("公式");
});
