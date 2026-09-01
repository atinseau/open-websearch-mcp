import { expect, test } from "bun:test";

import { parseSerp } from "./serp-parser.ts";
import { bingEngine, duckduckgoEngine, googleEngine } from "./engines.ts";
import type { RenderedDocument } from "@/features/discovery";

function document(text: string, links: readonly { url: string; text: string }[]): RenderedDocument {
  return {
    url: new URL("https://search.test/results"),
    text,
    markdown: text,
    links: links.map((link) => ({ url: new URL(link.url), text: link.text })),
    diagnostics: { title: "results", transferBytes: 0, settledMs: 0 },
  };
}

test("an engine's redirect wrapper is dereferenced to the real destination", () => {
  const result = parseSerp(
    googleEngine,
    document("Results", [
      {
        url: "https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fdocs",
        text: "Example docs",
      },
    ]),
  );

  expect(result.kind).toBe("parsed");
  if (result.kind !== "parsed") return;
  expect(result.candidates.map((candidate) => candidate.url.toString())).toEqual([
    "https://example.com/docs",
  ]);
});

test("a link on the engine's own host that is not a result wrapper is not a candidate", () => {
  const result = parseSerp(
    googleEngine,
    document("Results", [
      { url: "https://www.google.com/preferences", text: "Settings" },
      {
        url: "https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fa",
        text: "Real result",
      },
    ]),
  );

  expect(result.kind).toBe("parsed");
  if (result.kind !== "parsed") return;
  expect(result.candidates).toHaveLength(1);
});

test("a blocked page is reported as blocked whichever engine served it", () => {
  const result = parseSerp(googleEngine, document("Our systems have detected unusual traffic", []));

  expect(result).toEqual({ kind: "blocked", reason: "captcha" });
});

/**
 * A results page carries the engine's own product chrome — sign-in, help,
 * account, corporate pages — on hosts the engine does not "own" by name.
 * Admitting those as candidates spent places in a capped pool on links that
 * can never answer a question, and pushed the real source out of the results.
 */
test("an engine's own product chrome on a sibling host is not a candidate", () => {
  const result = parseSerp(
    bingEngine,
    document("Results", [
      { url: "https://help.bing.microsoft.com/#apex/18/en/10020/-1", text: "Help" },
      { url: "https://myaccount.microsoft.com/", text: "My account" },
      { url: "https://www.microsoft.com/en-us/microsoft-products-and-apps", text: "Microsoft" },
      { url: "https://go.microsoft.com/fwlink/?linkid=1", text: "Privacy" },
      {
        url: "https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9kb2Nz",
        text: "Example docs",
      },
    ]),
  );

  expect(result.kind).toBe("parsed");
  if (result.kind !== "parsed") return;
  expect(result.candidates.map((candidate) => candidate.url.toString())).toEqual([
    "https://example.com/docs",
  ]);
});

test("a genuine result on a chrome-adjacent host is still admitted", () => {
  // The rule must reject an engine's own chrome, not an entire company's
  // documentation: learn.microsoft.com answers real technical questions.
  const result = parseSerp(
    bingEngine,
    document("Results", [
      {
        url: "https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9sZWFybi5taWNyb3NvZnQuY29tL2VuLXVzL2RvY3M",
        text: "Microsoft Learn docs",
      },
    ]),
  );

  expect(result.kind).toBe("parsed");
  if (result.kind !== "parsed") return;
  expect(result.candidates.map((candidate) => candidate.url.hostname)).toEqual([
    "learn.microsoft.com",
  ]);
});

test("DuckDuckGo's own chrome is rejected without rejecting its results", () => {
  const result = parseSerp(
    duckduckgoEngine,
    document("Results", [
      { url: "https://duckduckgo.com/settings", text: "Settings" },
      { url: "https://spreadprivacy.com/tag/privacy-newsletter/", text: "Newsletter" },
      {
        url: "https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fspec",
        text: "Example spec",
      },
    ]),
  );

  expect(result.kind).toBe("parsed");
  if (result.kind !== "parsed") return;
  expect(result.candidates.map((candidate) => candidate.url.toString())).toEqual([
    "https://example.org/spec",
  ]);
});

/**
 * A search engine's own surface is chrome on whichever page it appears.
 * Chrome was recognised only by the engine being read, so Google's consent
 * screen - which Google itself rejects - was admitted as a result when
 * DuckDuckGo linked it. Measured on the corpus's Japanese question, it took
 * one of the ten returned places and can answer no question at all.
 */
test("another engine's surface is chrome too, whoever returned it", () => {
  const result = parseSerp(
    duckduckgoEngine,
    document("Results", [
      {
        url: "https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Fconsent.google.co.jp%2Fm%3Fcontinue%3Dhttps%3A%2F%2Ftranslate.google.co.jp%2F",
        text: "Google",
      },
      {
        url: "https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fspec",
        text: "Example spec",
      },
    ]),
  );

  expect(result.kind).toBe("parsed");
  if (result.kind !== "parsed") return;
  expect(result.candidates.map((candidate) => candidate.url.toString())).toEqual([
    "https://example.org/spec",
  ]);
});

test("a page with no results and no empty marker is a parse failure, not an empty result", () => {
  // Reporting this as empty would turn our own parsing defect into a claim
  // that the engine found nothing.
  const result = parseSerp(googleEngine, document("something unrecognised", []));

  expect(result).toEqual({ kind: "parse_failure", diagnostic: "unrecognized_serp_markup" });
});

/**
 * A search engine refuses in the language it was asked in. Measured on the
 * corpus's Japanese question, Google returns
 * "お使いのコンピュータ ネットワークから通常と異なるトラフィックが検出されました"
 * - its unusual-traffic CAPTCHA, in Japanese - and the English-only markers
 * missed it. A refusal read as `parse_failure` stops the engine chain by
 * design (ADR-0014), so the search never reached DuckDuckGo, which answers that
 * same question with 42 results. The case scored `network_error` on every run.
 *
 * A refusal must be recognised whatever language it is written in.
 */
test("SEARCH-012 a CAPTCHA in the page's own language is a refusal, not a parse failure", () => {
  const japanese = parseSerp(
    googleEngine,
    document(
      "このページについて お使いのコンピュータ ネットワークから通常と異なるトラフィックが検出されました。",
      [],
    ),
  );

  expect(japanese).toEqual({ kind: "blocked", reason: "captcha" });
});

test("SEARCH-012 a page that merely mentions traffic is not a refusal", () => {
  // The marker must be the refusal itself, not any page discussing traffic.
  const article = parseSerp(
    googleEngine,
    document("ネットワーク トラフィックの測定方法について解説します。", [
      { url: "https://example.test/a", text: "記事" },
    ]),
  );

  expect(article.kind).toBe("parsed");
});
