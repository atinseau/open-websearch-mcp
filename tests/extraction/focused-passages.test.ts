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
