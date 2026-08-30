import { expect, test } from "bun:test";

import { parseSerp } from "./serp-parser.ts";
import { googleEngine } from "./engines.ts";
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

test("a page with no results and no empty marker is a parse failure, not an empty result", () => {
  // Reporting this as empty would turn our own parsing defect into a claim
  // that the engine found nothing.
  const result = parseSerp(googleEngine, document("something unrecognised", []));

  expect(result).toEqual({ kind: "parse_failure", diagnostic: "unrecognized_serp_markup" });
});
