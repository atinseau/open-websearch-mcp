import { expect, test } from "bun:test";

import { createWebResearchApplication } from "@/features/investigation";
import { defaultConfiguration } from "@/features/configuration";
import { openStorage } from "@/features/storage";
import { structuredToolResultSchema } from "@/mcp/contracts";
import { context, fixtureDiscovery, workspace } from "./web-tools-fixture.ts";
import type { CallContext } from "@/features/investigation";
import type { Renderer } from "@/features/rendering";

/**
 * CONFIG-004 requires the output limits to be configurable, and `[output]` is
 * validated and written into every workspace's TOML. It was never read: the
 * number of passages a search returns came from a constant in the extractor, so
 * changing the file changed nothing and the schema promised a control that did
 * not exist.
 */
const sections = [
  "<h2>First</h2>",
  `<p>needle one. ${"Alpha detail. ".repeat(70)}</p>`,
  "<h2>Second</h2>",
  `<p>needle two. ${"Beta detail. ".repeat(70)}</p>`,
  "<h2>Third</h2>",
  `<p>needle three. ${"Gamma detail. ".repeat(70)}</p>`,
  "<h2>Fourth</h2>",
  `<p>needle four. ${"Delta detail. ".repeat(70)}</p>`,
].join("");

const renderer: Renderer = {
  render: async (request) => ({
    url: request.url,
    text: sections,
    markdown: sections,
    links: [],
    diagnostics: { title: "Fixture", transferBytes: 1, settledMs: 1 },
  }),
};

function contextWith(passagesPerSource: number): CallContext {
  const base = defaultConfiguration;
  return {
    ...context(),
    configuration: {
      ...context().configuration,
      configuration: {
        ...base,
        output: { ...base.output, search_passages_per_source: passagesPerSource },
      },
    },
  };
}

async function passagesReturned(perSource: number): Promise<number> {
  const storage = await openStorage({ workspace: workspace() });
  const application = createWebResearchApplication({
    storage,
    renderer,
    discovery: fixtureDiscovery(["https://docs.test/page"]),
  });
  const result = structuredToolResultSchema.parse(
    await application
      .webSearch({ query: "needle", maxResults: 1 }, contextWith(perSource))
      .then((value) => value.structuredContent),
  );
  storage.close();
  return result.results[0]?.passages.length ?? 0;
}

test("CONFIG-004 the configured number of passages per source is what a search returns", async () => {
  expect(await passagesReturned(2)).toBe(2);
  expect(await passagesReturned(4)).toBe(4);
});

/**
 * `web_open` reads the configured character budget when the caller names none.
 *
 * `[output].open_default_chars` and `open_max_chars` are validated in every
 * workspace TOML and read nowhere: `grep` finds them only in the schema and
 * its defaults. An open without `max_chars` therefore fell through to the
 * extractor's two-passage constant, and changing the file changed nothing.
 *
 * The MCP layer applies its own 12,000 default, so a client over stdio is
 * unaffected. The configuration is the promise that breaks — the same defect
 * `CONFIG-004` names above, on the other tool.
 */
function contextWithOpenChars(openDefaultChars: number): CallContext {
  const base = defaultConfiguration;
  return {
    ...context(),
    configuration: {
      ...context().configuration,
      configuration: {
        ...base,
        output: { ...base.output, open_default_chars: openDefaultChars },
      },
    },
  };
}

async function openedPassages(openDefaultChars: number): Promise<number> {
  const storage = await openStorage({ workspace: workspace() });
  const application = createWebResearchApplication({ storage, renderer });
  const result = structuredToolResultSchema.parse(
    await application
      .webOpen({ url: new URL("https://docs.test/page") }, contextWithOpenChars(openDefaultChars))
      .then((value) => value.structuredContent),
  );
  storage.close();
  return result.results[0]?.passages.length ?? 0;
}

test("CONFIG-004 an open without max_chars reads the configured character budget", async () => {
  // 1,200 characters per passage, so a 1,200-character budget is one passage
  // and a 3,600-character budget is three.
  expect(await openedPassages(1_200)).toBe(1);
  expect(await openedPassages(3_600)).toBe(3);
});

/**
 * The configured ceiling bounds an open, as `MCP-003` states: default 12,000,
 * maximum 25,000. The MCP schema caps `max_chars` at its own constant, so a
 * workspace lowering `open_max_chars` was ignored — the same unread
 * configuration as the default above.
 */
test("CONFIG-004 an open is bounded by the configured maximum", async () => {
  const base = defaultConfiguration;
  const bounded: CallContext = {
    ...context(),
    configuration: {
      ...context().configuration,
      configuration: {
        ...base,
        output: { ...base.output, open_default_chars: 1_200, open_max_chars: 2_400 },
      },
    },
  };

  const storage = await openStorage({ workspace: workspace() });
  const application = createWebResearchApplication({ storage, renderer });
  const result = structuredToolResultSchema.parse(
    await application
      .webOpen({ url: new URL("https://docs.test/page"), maxChars: 12_000 }, bounded)
      .then((value) => value.structuredContent),
  );
  storage.close();

  // 2,400 characters at 1,200 per passage is two, not the ten the caller asked
  // for.
  expect(result.results[0]?.passages.length).toBe(2);
});
