import { expect, test } from "bun:test";

import { createDiscovery } from "./discovery-factory.ts";
import { googleEngine } from "@/features/discovery/domain/engines";
import type { RenderedDocument, Renderer } from "@/features/discovery";

const renderer: Renderer = {
  render: () =>
    Promise.resolve({
      url: new URL("https://www.google.com/search?q=x"),
      text: "Our systems have detected unusual traffic",
      markdown: "",
      links: [],
      diagnostics: { title: "", transferBytes: 0, settledMs: 0 },
    } satisfies RenderedDocument),
};

test("the configured order is honoured for engines that have a parser", () => {
  const discovery = createDiscovery({ renderer, engines: ["google"] });

  expect(discovery.engineNames()).toEqual(["google"]);
});

test("the default order builds the full three-engine chain", () => {
  const discovery = createDiscovery({ renderer, engines: ["google", "duckduckgo", "bing"] });

  expect(discovery.engineNames()).toEqual(["google", "duckduckgo", "bing"]);
});

/**
 * Every configurable engine has a parser today, so this covers a future one
 * named in configuration before its parser lands: skipping it with a
 * diagnostic keeps discovery available, while telling the operator, because a
 * silently shorter chain looks exactly like engines that never answered.
 */
test("an engine with no parser is skipped, and the operator is told", () => {
  const diagnostics: string[] = [];
  const discovery = createDiscovery({
    renderer,
    engines: ["google", "duckduckgo"],
    diagnostic: (message) => diagnostics.push(message),
    implemented: { google: googleEngine },
  });

  expect(discovery.engineNames()).toEqual(["google"]);
  expect(diagnostics.join(" ")).toContain("duckduckgo");
});

test("a chain with no usable engine at all is refused rather than silently mute", () => {
  expect(() =>
    createDiscovery({ renderer, engines: ["duckduckgo"], implemented: { google: googleEngine } }),
  ).toThrow(/no usable engine/i);
});
