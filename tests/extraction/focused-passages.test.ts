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
 * A rendered documentation page begins with its whole navigation collapsed into
 * one run: `Documentation IndexFetch the complete...Skip to main contentModel
 * Context Protocol home pageVersion 2026-07-28`. Every menu label is glued to
 * the next, because the labels are separate elements with no text between them.
 *
 * That run names every section a site has, so it matches more of any question
 * than the section that answers one. Measured on modelcontextprotocol.io it was
 * block 0 of 58, 2,462 characters, and scored 14 where the block holding
 * "MUST declare the tools capability" scored 5 and ranked tenth. The case
 * scored 0 for evidence coverage with that sentence on the page.
 *
 * Glued labels are what tells them apart: 2.84 lowercase-uppercase joins per
 * 100 characters in that run against 0.76 in the prose, and only 4 of the
 * page's 58 blocks exceed two.
 */
test("EXTRACT-009 a page's glued-together navigation is not its evidence", async () => {
  const navigation = (
    "Documentation IndexFetch the complete documentation indexSkip to main content" +
    "Model Context Protocol home pageVersion 2026-07-28ToolsSpecificationExtensions" +
    "RegistryCommunityKey ChangesArchitectureBase ProtocolOverviewVersioning" +
    "TransportsAuthorizationClient FeaturesRootsSamplingServer FeaturesPrompts" +
    "ResourcesToolsUtilitiesSchema ReferenceOn this pageCapabilitiesProtocol" +
    "MessagesListing ToolsCalling ToolsMessage FlowData TypesTool NamesTool Result"
  ).repeat(4);
  const answer =
    "Servers that support tools MUST declare the tools capability during initialize. " +
    "The tools/list request returns them, and version negotiation and message framing " +
    "are settled before any of it. ";

  const focused = await registry.extract({
    documentUrl: new URL("https://spec.test/server/tools"),
    renderedText: `<p>${navigation}</p><p>${answer}</p>`,
    markdown: `<p>${navigation}</p><p>${answer}</p>`,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus:
      "what does the specification require from a server during initialize and tools/list, including version negotiation and message framing",
    maxPassages: 1,
  });

  expect(focused.status).toBe("success");
  expect(focused.passages[0]?.text).toContain("MUST declare the tools capability");
});

/** Ordinary prose with capitalised names is not navigation. */
test("EXTRACT-009 a passage naming products and people is still evidence", async () => {
  const prose =
    "The Model Context Protocol defines how a server and a client negotiate. " +
    "Anthropic, OpenAI and Google have each shipped an implementation of it. " +
    "A server declares its capabilities during initialize, and JSON-RPC carries them. ";

  const focused = await registry.extract({
    documentUrl: new URL("https://spec.test/overview"),
    renderedText: `<p>${prose}</p><p>Unrelated closing note.</p>`,
    markdown: `<p>${prose}</p><p>Unrelated closing note.</p>`,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus: "how does a server negotiate capabilities during initialize",
    maxPassages: 1,
  });

  expect(focused.status).toBe("success");
  expect(focused.passages[0]?.text).toContain("negotiate");
});

/**
 * A page's table of contents is navigation in another shape: one short labelled
 * line per section, separated by newlines rather than glued together. It names
 * every subject a page covers, so it matches more of any question than the
 * section that answers one.
 *
 * Measured on SQLite's FTS5 page, its contents list was block 6 of 790, 2,395
 * characters, and scored highest of all of them - 76 lines, every one under 70
 * characters - while the block naming `sqlite3_fts5_init` ranked 487th. That
 * case scored zero for evidence coverage with the symbol on the page.
 */
test("EXTRACT-009 a table of contents is not returned as evidence", async () => {
  const contents = [
    "Table Of Contents",
    "1. Overview of FTS5",
    "2. Compiling and Using FTS5",
    "2.1. Building FTS5 as part of SQLite",
    "2.2. Building a Loadable Extension",
    "3. Full-text Query Syntax",
    "4. FTS5 Table Creation and Initialization",
    "5. External Content and Contentless Tables",
    "6. Auxiliary Functions",
    "7. Detecting FTS5 support at runtime",
    "8. Limitations and guarantees",
    "9. Appendix",
  ]
    .flatMap((line, index) => [line, `${index}. FTS5 detail section about tables and support`])
    .join("\n");
  const answer =
    "The sqlite3_fts5_init entry point registers the loadable extension, and external " +
    "content tables carry the limitations described in this section at runtime. ";

  const focused = await registry.extract({
    documentUrl: new URL("https://sqlite.test/fts5"),
    renderedText: `${contents}\n\n## Detecting support\n\n${answer}`,
    markdown: `${contents}\n\n## Detecting support\n\n${answer}`,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus:
      "explain how to detect FTS5 support at runtime and what guarantees or limitations apply to external content tables",
    maxPassages: 1,
  });

  expect(focused.status).toBe("success");

  expect(focused.passages[0]?.text).toContain("sqlite3_fts5_init");
});

/** A short list of real sentences is content, not a contents list. */
test("EXTRACT-009 a list of full sentences is still evidence", async () => {
  const listed = [
    "External content tables store their text in another table entirely.",
    "The rowid of that table is what FTS5 looks up when it needs a row.",
    "Keeping the two in step is the caller's responsibility at runtime.",
  ].join("\n");

  const focused = await registry.extract({
    documentUrl: new URL("https://sqlite.test/fts5"),
    renderedText: `<p>${listed}</p><p>Unrelated closing note about history.</p>`,
    markdown: `<p>${listed}</p><p>Unrelated closing note about history.</p>`,
    links: [],
    headers: new Headers({ "content-type": "text/html" }),
    focus: "what does an external content table look up at runtime",
    maxPassages: 1,
  });

  expect(focused.status).toBe("success");
  expect(focused.passages[0]?.text).toContain("rowid");
});
