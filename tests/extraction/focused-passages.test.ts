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
 * A page that arrives as plain prose is one very long run, so it is cut into
 * passage-sized pieces before anything is scored. The cut is blind to the
 * question, and the pieces are then ranked as peers of every other passage on
 * the page - so a piece that merely mentions ordinary words can win over the
 * piece holding the sentence that answers.
 *
 * Measured against SQLite's FTS5 page, the highest-scoring block carried the
 * expected evidence and was 2,395 characters; it was split, and neither
 * returned passage kept the evidence.
 */
/**
 * A question's ordinary words - "to", "at", "and", "or" - appear in nearly
 * every passage of a page, so counting matched terms equally lets grammar
 * decide which passage is evidence.
 *
 * Measured against SQLite's FTS5 page: the returned passage matched
 * `["using","primary","to","fts5","support","at","and","or","tables"]` and
 * carried one expected phrase, while the section titled "Building a Loadable
 * Extension" carried three and lost, because it happened to use four fewer
 * connectives.
 */
test("EXTRACT-009 connectives do not decide which passage is evidence", async () => {
  // Both passages are the same length and match the same count of question
  // terms. One matches only connectives; the other matches the terms that name
  // the subject. Counting matches equally makes them tie, and the first wins.
  const connectives =
    "This part is about tables and support at a level, and it relates to other parts. ".repeat(14);
  const subject = "The sqlite3_fts5_init symbol is the loadable extension entry point. ".repeat(14);
  const page = `<p>${connectives}</p><p>${subject}</p>`;

  const focused = await registry.extract({
    documentUrl: new URL("https://sqlite.test/fts5"),
    renderedText: page,
    markdown: page,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus: "sqlite3_fts5_init loadable extension and support at tables",
  });

  expect(focused.status).toBe("success");
  expect(focused.passages[0]?.text.toLowerCase()).toContain("sqlite3_fts5_init");
});
