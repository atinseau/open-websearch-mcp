import { expect, test } from "bun:test";

import type { Candidate } from "@/features/discovery";
import type { ConfigurationSnapshot } from "@/features/configuration";

import { fillFromBestCandidates, type RankedCandidate } from "./fill-results.ts";
import type { CallContext } from "../index.ts";
import type { Prepared } from "./search-preparation.ts";

const configuration: ConfigurationSnapshot = {
  scheduler: {
    startCapacity: 8,
    maximumCapacity: 40,
    lastSafeCapacity: 16,
    perHostCapacity: 2,
    googleSerpCapacity: 1,
    safeRssBudgetBytes: 201_326_592,
    warmP95BaselineMs: 456,
    memoryTelemetryAbsentMaximumCapacity: 16,
    growthStep: 2,
    healthyWindowsRequired: 2,
    windowCompletedNavigations: 20,
    minimumWindowMs: 10_000,
    backpressure: {
      errorRate: 0.15,
      timeoutRate: 0.1,
      p95WarmBaselineMultiplier: 2,
      rssSafeBudgetFraction: 0.8,
      action: "halve_ceiling_minimum_1",
    },
  },
};

function context(): CallContext {
  return { abortController: new AbortController(), configuration };
}

function ranked(url: string, score: number): RankedCandidate {
  return { candidate: { url: new URL(url), sourceType: "organic" }, score };
}

/**
 * Only the candidate is read by the code under test; the document and its
 * extraction belong to the renderer, which this test does not exercise.
 */
function prepared(candidate: Candidate): Prepared {
  return {
    candidate,
    document: {
      url: candidate.url,
      text: "",
      markdown: "",
      links: [],
      diagnostics: { title: "", transferBytes: 0, settledMs: 0 },
    },
    extracted: {
      status: "success",
      mimeType: "text/html",
      passages: [],
      codeBlocks: [],
      contentLinks: [],
      navigationLinks: [],
    },
  };
}

/**
 * A host that fails is a property of the host, not of one page on it.
 *
 * Measured on the corpus's Japanese question, every page of `www.nic.ad.jp`
 * fails the same way and each one spends the renderer's full navigation
 * deadline before it does. Two of them sat at the top of the pool, so the
 * search burned about sixty seconds - twice its own thirty-second budget - on
 * a host that answered nothing, and expired before reaching the sources that
 * do answer.
 *
 * After a host has failed twice in one call, its remaining pages are skipped.
 */
test("a host that has failed twice is not asked a third time", async () => {
  const attempted: string[] = [];

  const results = await fillFromBestCandidates(
    [
      ranked("https://dead.test/a", 0.9),
      ranked("https://dead.test/b", 0.8),
      ranked("https://dead.test/c", 0.7),
      ranked("https://alive.test/x", 0.6),
    ],
    5,
    context(),
    {
      prepare: async (candidate) => {
        attempted.push(candidate.url.toString());
        if (candidate.url.hostname === "dead.test") return undefined;
        return prepared(candidate);
      },
      emit: async (value) => value,
    },
  );

  expect(attempted).toEqual(["https://dead.test/a", "https://dead.test/b", "https://alive.test/x"]);
  expect(results).toHaveLength(1);
});

/**
 * One failure is a page, not a host. A site that serves a bad page still
 * serves its good ones, so the circuit only opens on the second failure.
 */
test("a single failure does not close a host", async () => {
  const attempted: string[] = [];

  await fillFromBestCandidates(
    [ranked("https://docs.test/a", 0.9), ranked("https://docs.test/b", 0.8)],
    5,
    context(),
    {
      prepare: async (candidate) => {
        attempted.push(candidate.url.toString());
        return candidate.url.pathname === "/a" ? undefined : prepared(candidate);
      },
      emit: async (value) => value,
    },
  );

  expect(attempted).toEqual(["https://docs.test/a", "https://docs.test/b"]);
});
