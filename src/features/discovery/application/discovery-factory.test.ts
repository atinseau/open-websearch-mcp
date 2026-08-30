import { expect, test } from "bun:test";

import { createDiscovery } from "./discovery-factory.ts";
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

/**
 * The default configuration already names three engines, and their parsers
 * arrive in later tickets. Until then an unimplemented engine is skipped with
 * a diagnostic rather than refused, so naming it cannot make discovery
 * unavailable — but the operator is told, because a silently shorter chain
 * looks exactly like engines that never answered.
 */
test("an engine with no parser yet is skipped, and the operator is told", () => {
  const diagnostics: string[] = [];
  const discovery = createDiscovery({
    renderer,
    engines: ["google", "duckduckgo", "bing"],
    diagnostic: (message) => diagnostics.push(message),
  });

  expect(discovery.engineNames()).toEqual(["google", "duckduckgo"]);
  expect(diagnostics.join(" ")).toContain("bing");
});

test("a chain with no usable engine at all is refused rather than silently mute", () => {
  expect(() => createDiscovery({ renderer, engines: ["bing"] })).toThrow(/no usable engine/i);
});
