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
