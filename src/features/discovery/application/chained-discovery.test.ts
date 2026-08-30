import { expect, test } from "bun:test";

import { ChainedDiscovery } from "./chained-discovery.ts";
import type { GoogleDiscoveryResult, GoogleDiscoveryService } from "@/features/discovery";

type Reply = Omit<GoogleDiscoveryResult, "candidates" | "suggestedQueries"> &
  Partial<Pick<GoogleDiscoveryResult, "candidates" | "suggestedQueries">>;

function engine(name: string, reply: Reply) {
  const calls: string[] = [];
  const service: GoogleDiscoveryService = {
    profile: () => ({ id: "google-public", persistent: true, importsUserCredentials: false }),
    discover: () => {
      calls.push(name);
      return Promise.resolve({ candidates: [], suggestedQueries: [], ...reply });
    },
  };
  return { name, service, calls };
}

const candidate = {
  url: new URL("https://example.com/a"),
  sourceType: "organic" as const,
  title: "Example",
};

function chain(...engines: ReturnType<typeof engine>[]) {
  const consulted: string[] = [];
  const discovery = new ChainedDiscovery({
    engines: engines.map((item) => ({
      name: item.name,
      discover: (input) => {
        consulted.push(item.name);
        return item.service.discover(input);
      },
    })),
  });
  return { discovery, consulted };
}

function searchInput() {
  return {
    query: "q",
    investigationId: "investigation-1",
    signal: new AbortController().signal,
  };
}

test("a blocked engine falls through to the next one", async () => {
  const { discovery, consulted } = chain(
    engine("google", { status: "blocked", reason: "captcha" }),
    engine("duckduckgo", { status: "success", candidates: [candidate] }),
  );

  const result = await discovery.discover(searchInput());

  expect(consulted).toEqual(["google", "duckduckgo"]);
  expect(result.status).toBe("success");
  expect(result.engine).toBe("duckduckgo");
});

test("an engine that errors falls through, because it produced no answer", async () => {
  const { discovery, consulted } = chain(
    engine("google", { status: "error", reason: "network" }),
    engine("duckduckgo", { status: "success", candidates: [candidate] }),
  );

  await discovery.discover(searchInput());

  expect(consulted).toEqual(["google", "duckduckgo"]);
});

test("an engine reporting no results ends the chain", async () => {
  // Retrying elsewhere would replace a true absence of results with another
  // index's noise.
  const { discovery, consulted } = chain(
    engine("google", { status: "empty" }),
    engine("duckduckgo", { status: "success", candidates: [candidate] }),
  );

  const result = await discovery.discover(searchInput());

  expect(consulted).toEqual(["google"]);
  expect(result.status).toBe("empty");
});

test("a parse failure ends the chain, so our own defect stays visible", async () => {
  const { discovery, consulted } = chain(
    engine("google", { status: "parse_failure", reason: "unrecognized_serp_markup" }),
    engine("duckduckgo", { status: "success", candidates: [candidate] }),
  );

  const result = await discovery.discover(searchInput());

  expect(consulted).toEqual(["google"]);
  expect(result.status).toBe("parse_failure");
});

test("the chain stops at the first engine that answers", async () => {
  const { discovery, consulted } = chain(
    engine("google", { status: "success", candidates: [candidate] }),
    engine("duckduckgo", { status: "success", candidates: [candidate] }),
  );

  await discovery.discover(searchInput());

  expect(consulted).toEqual(["google"]);
});

test("exhausting every engine reports blocked and names the last refusal", async () => {
  const { discovery, consulted } = chain(
    engine("google", { status: "blocked", reason: "captcha" }),
    engine("duckduckgo", { status: "blocked", reason: "waf" }),
  );

  const result = await discovery.discover(searchInput());

  expect(consulted).toEqual(["google", "duckduckgo"]);
  expect(result.status).toBe("blocked");
  expect(result.engine).toBe("duckduckgo");
  expect(result.reason).toBe("waf");
});

test("a successful result reports the engine that produced it", async () => {
  const { discovery } = chain(engine("bing", { status: "success", candidates: [candidate] }));

  expect((await discovery.discover(searchInput())).engine).toBe("bing");
});

test("engines are consulted one at a time, so at most one SERP renders at once", async () => {
  let active = 0;
  let peak = 0;
  const slow = (
    name: string,
  ): { name: string; discover: () => Promise<GoogleDiscoveryResult> } => ({
    name,
    discover: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep(5);
      active -= 1;
      return { status: "blocked", reason: "captcha", candidates: [], suggestedQueries: [] };
    },
  });
  const discovery = new ChainedDiscovery({ engines: [slow("google"), slow("duckduckgo")] });

  await discovery.discover(searchInput());

  expect(peak).toBe(1);
});
