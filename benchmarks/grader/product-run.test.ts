import { expect, test } from "bun:test";

import { toCaseResult } from "./product-run.ts";

test("a search result becomes a graded page carrying its passage text", () => {
  const result = toCaseResult("technical-pdfjs", {
    results: [
      {
        url: "https://spec.test/a",
        final_url: "https://spec.test/a",
        passages: [{ text: "alpha beta" }, { text: "gamma" }],
      },
    ],
  });

  expect(result.case_id).toBe("technical-pdfjs");
  expect(result.results).toEqual([
    { url: "https://spec.test/a", text: "alpha beta\ngamma", token_count: undefined },
  ]);
});

test("a redirected result is aliased after the ranked pages so ranks stay truthful", () => {
  const result = toCaseResult("technical-pdfjs", {
    results: [
      {
        url: "https://spec.test/short",
        final_url: "https://spec.test/canonical",
        passages: [{ text: "alpha" }],
      },
      { url: "https://other.test/b", final_url: "https://other.test/b", passages: [] },
    ],
  });

  expect(result.results.map((page) => page.url)).toEqual([
    "https://spec.test/short",
    "https://other.test/b",
    "https://spec.test/canonical",
  ]);
});

test("a malformed tool payload is refused rather than silently scored as empty", () => {
  expect(() => toCaseResult("technical-pdfjs", { results: "nope" })).toThrow();
});

test("a blocked search is reported as blocked, not as a product that found nothing", () => {
  const result = toCaseResult("technical-pdfjs", {
    status: "blocked",
    reason: "captcha",
    results: [],
  });

  expect(result.run_status).toEqual({ status: "blocked", reason: "captcha" });
});

test("a successful search records its status too", () => {
  const result = toCaseResult("technical-pdfjs", { status: "success", results: [] });

  expect(result.run_status).toEqual({ status: "success", reason: undefined });
});
