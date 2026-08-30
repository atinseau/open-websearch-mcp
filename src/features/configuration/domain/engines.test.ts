import { expect, test } from "bun:test";

import { configurationSchema, defaultConfiguration } from "./configuration.ts";

function withEngines(engines: unknown) {
  return configurationSchema.safeParse({
    ...defaultConfiguration,
    search: { ...defaultConfiguration.search, engines },
  });
}

test("discovery consults Google, DuckDuckGo then Bing unless configured otherwise", () => {
  expect(defaultConfiguration.search.engines).toEqual(["google", "duckduckgo", "bing"]);
});

test("a workspace may reorder the engines", () => {
  const parsed = withEngines(["bing", "google"]);

  expect(parsed.success).toBe(true);
  expect(parsed.success && parsed.data.search.engines).toEqual(["bing", "google"]);
});

test("a workspace may drop an engine entirely", () => {
  expect(withEngines(["duckduckgo"]).success).toBe(true);
});

test("an unknown engine is refused at load, naming the offending value", () => {
  const parsed = withEngines(["google", "altavista"]);

  // Silently skipping it would quietly shrink the operator's engine list.
  expect(parsed.success).toBe(false);
  expect(JSON.stringify(parsed.error?.issues)).toContain("altavista");
});

test("an empty engine list is refused: discovery with no engine cannot answer", () => {
  expect(withEngines([]).success).toBe(false);
});

test("a duplicated engine is refused rather than queried twice", () => {
  const parsed = withEngines(["google", "google"]);

  expect(parsed.success).toBe(false);
  expect(JSON.stringify(parsed.error?.issues)).toMatch(/duplicate/i);
});
