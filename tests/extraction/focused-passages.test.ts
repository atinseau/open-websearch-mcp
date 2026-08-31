import { expect, test } from "bun:test";

import { createExtractorRegistry } from "@/features/extraction";

const registry = createExtractorRegistry();

const specPage = [
  "<h2>Introduction</h2>",
  `<p>${"This standard defines URLs and how they are written down. ".repeat(30)}</p>`,
  "<h2>Path state</h2>",
  `<p>A single-dot path segment is removed here, and a validation error is reported for malformed % escapes. ${"Detail. ".repeat(60)}</p>`,
  "<h2>Appendix</h2>",
  `<p>${"Unrelated closing remarks about acknowledgements and history. ".repeat(30)}</p>`,
].join("");

function input(focus?: string) {
  return {
    documentUrl: new URL("https://url.spec.test/"),
    renderedText: specPage,
    markdown: specPage,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus,
  };
}

test("EXTRACT-009 a long page is read for the part the question is about", async () => {
  // A search over a large specification returned its opening prose, because
  // passage selection had no idea what was being asked. The extractor already
  // scores passages against a focus; a search simply never supplied one.
  const focused = await registry.extract(input("single-dot path segment validation error"));

  expect(focused.status).toBe("success");
  const text = focused.passages
    .map((passage) => passage.text)
    .join("\n")
    .toLowerCase();
  expect(text).toContain("single-dot path segment");
});

test("without a focus the same page falls back to its longest passages", async () => {
  const unfocused = await registry.extract(input());

  expect(unfocused.status).toBe("success");
  expect(unfocused.passages.length).toBeGreaterThan(0);
});

/**
 * Every word of a question counted the same, so a passage that happened to use
 * several of its ordinary words beat one that used the rare term naming the
 * subject. Measured against the WHATWG URL Standard, the two returned passages
 * carried "validation error" - a phrase the page uses throughout - while the
 * section on the path percent-encode set, which is what the question asks
 * about, was left behind.
 *
 * A term that appears all over a page cannot distinguish one part of it from
 * another; a term that appears in one place points at that place.
 */
test("EXTRACT-009 a rare term outweighs words the page uses everywhere", async () => {
  const page = [
    "<h2>Introduction</h2>",
    `<p>A validation error is reported here. ${"Ordinary standard prose. ".repeat(60)}</p>`,
    "<h2>Errors</h2>",
    `<p>A validation error is also reported here. ${"More ordinary prose. ".repeat(60)}</p>`,
    "<h2>Percent encoding</h2>",
    `<p>The path percent-encode set applies to each byte. ${"Detail. ".repeat(60)}</p>`,
  ].join("");

  const focused = await registry.extract({
    documentUrl: new URL("https://url.spec.test/"),
    renderedText: page,
    markdown: page,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus: "what does the standard say about the path percent-encode set and a validation error",
  });

  expect(focused.status).toBe("success");
  const text = focused.passages
    .map((passage) => passage.text)
    .join("\n")
    .toLowerCase();
  expect(text).toContain("path percent-encode set");
});
