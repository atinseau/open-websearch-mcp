import { expect, test } from "bun:test";

import { bingEngine, duckduckgoEngine, googleEngine } from "./engines.ts";

/**
 * An engine asked without a language answers from where the machine is, not
 * from what was asked. Measured live from France, Bing answered an English
 * question about PDF.js with a doctor-booking site, a French-English
 * dictionary and a public-health page - three of its ten results, and not one
 * of them about PDF.js. The same query with an explicit language returned the
 * project's own documentation first.
 *
 * The agent's own locale still wins when it states one; this only decides what
 * "unspecified" means, and unspecified must not mean "wherever this machine
 * happens to be".
 */
test("an engine asked without a locale is still asked in a stated language", () => {
  for (const engine of [googleEngine, duckduckgoEngine, bingEngine]) {
    const url = engine.searchUrl("pdf.js rendering");

    expect([...url.searchParams.keys()].length).toBeGreaterThan(1);
    expect(url.search).toMatch(/en/iu);
  }
});

test("an explicit locale is still the one that is sent", () => {
  expect(bingEngine.searchUrl("q", "fr-FR").searchParams.get("setlang")).toBe("fr-FR");
  expect(duckduckgoEngine.searchUrl("q", "fr-FR").searchParams.get("kl")).toBe("fr-FR");
  expect(googleEngine.searchUrl("q", "fr-FR").searchParams.get("hl")).toBe("fr-FR");
});

test("`auto` means the product decides, not that the machine's region decides", () => {
  // "auto" is the configured default, and it used to reach the engine as
  // nothing at all, which is how the machine's region came to answer.
  expect(bingEngine.searchUrl("q", "auto").searchParams.get("setlang")).toBe("en-US");
});

/**
 * Answering every unspecified question in English would break the questions
 * that are not in English. The question's own script is the evidence for what
 * language it wants, and it is evidence the machine's location never had.
 */
test("a question's own script decides its language when the agent states none", () => {
  const japanese = bingEngine.searchUrl(
    "日本語の一次情報と公式仕様を使って、URL の国際化ドメイン名について説明してください。",
  );

  expect(japanese.searchParams.get("setlang")).toBe("ja-JP");
});

test("a locale the agent stated outranks the question's script", () => {
  const stated = bingEngine.searchUrl("日本語の一次情報について", "en-US");

  expect(stated.searchParams.get("setlang")).toBe("en-US");
});
