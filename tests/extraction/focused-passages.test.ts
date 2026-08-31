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

test("EXTRACT-009 a passage answering the rare terms of a question wins over one repeating its common words", async () => {
  // Scoring counted matched tokens equally, so an introduction repeating
  // "sqlite" and "documentation" beat the section that actually answers. A
  // term appearing in few passages says more about where the answer is than
  // one appearing everywhere.
  const page = [
    "<h2>About SQLite</h2>",
    `<p>SQLite documentation covers SQLite runtime behaviour. ${"SQLite documentation detail. ".repeat(40)}</p>`,
    "<h2>Entry points</h2>",
    `<p>Two entry points are defined: sqlite3_fts5_init is the loadable extension entry point. ${"Detail about initialisation. ".repeat(30)}</p>`,
  ].join("");

  const focused = await registry.extract({
    documentUrl: new URL("https://sqlite.test/fts5"),
    renderedText: page,
    markdown: page,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus: "SQLite documentation detect FTS5 runtime entry points",
  });

  expect(focused.status).toBe("success");
  const text = focused.passages
    .map((passage) => passage.text)
    .join("\n")
    .toLowerCase();
  expect(text).toContain("entry point");
});

test("EXTRACT-009 a table of contents does not outrank the section that answers", async () => {
  // A contents list mentions every keyword in the question and explains none
  // of them. Counting matched tokens gave it the top score on sqlite.org's
  // FTS5 page, so a search returned the index instead of the answer. A term
  // concentrated in few passages locates the answer; one spread across many
  // does not.
  const contents =
    "Table Of Contents 1. Overview of FTS5 2. Compiling FTS5 3. FTS5 entry points 4. FTS5 rowid 5. FTS5 external content";
  const answer =
    "Two entry points are defined for the loadable extension, and the rowid lookup resolves against the external content table.";
  const filler = Array.from(
    { length: 8 },
    (unused, index) =>
      `<h2>Section ${index}</h2><p>FTS5 discussion of tables and queries in SQLite. ${"Filler. ".repeat(30)}</p>`,
  ).join("");
  const page = `<h2>Contents</h2><p>${contents}</p>${filler}<h2>Entry points</h2><p>${answer} ${"Detail. ".repeat(30)}</p>`;

  const focused = await registry.extract({
    documentUrl: new URL("https://sqlite.test/fts5"),
    renderedText: page,
    markdown: page,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus: "FTS5 entry points rowid external content",
  });

  const text = focused.passages
    .map((passage) => passage.text)
    .join("\n")
    .toLowerCase();
  expect(text).toContain("two entry points are defined");
});

test("EXTRACT-009 a real specification yields the section that answers, not its contents list", async () => {
  // sqlite.org's FTS5 page opens with a table of contents that names every
  // keyword in the question and explains none of them. Counting matched tokens
  // scored it top, so a search returned the index: "entry points" and the
  // rowid rules were both absent from the two passages a search may return,
  // although both are on the page.
  const page = await Bun.file(`${import.meta.dir}/fixtures/sqlite-fts5.html`).text();

  const focused = await registry.extract({
    documentUrl: new URL("https://sqlite.org/fts5.html"),
    renderedText: page,
    markdown: page,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus:
      "Using primary SQLite documentation, explain how to detect FTS5 support at runtime and what guarantees or limitations apply to external-content FTS5 tables.",
  });

  expect(focused.status).toBe("success");
  const text = focused.passages
    .map((passage) => passage.text)
    .join("\n")
    .toLowerCase();
  expect(text).not.toContain("table of contents");
});
