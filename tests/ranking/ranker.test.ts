import { expect, test } from "bun:test";
import { defaultConfiguration } from "@/features/configuration";
import {
  analyzeQuery,
  createRanker,
  selectPreRenderCandidates,
  type CandidateRankingInput,
} from "@/features/ranking";

const observedAt = new Date("2026-08-29T00:00:00.000Z");

function candidate(
  path: string,
  changes: Partial<CandidateRankingInput> = {},
): CandidateRankingInput {
  return {
    url: new URL(`https://example.test/${path}`),
    sourceType: "organic",
    title: "deterministic ranking guide",
    snippet: "A deterministic ranking guide.",
    googlePosition: 2,
    isNovel: true,
    content: "deterministic ranking guide with sufficient original source content ".repeat(20),
    headings: ["Deterministic ranking"],
    anchors: ["ranking guide"],
    hasAuthor: true,
    hasCitations: true,
    originalProvenance: true,
    boilerplateRatio: 0,
    extractable: true,
    supported: true,
    ...changes,
  };
}

function score(
  item: CandidateRankingInput,
  changes: Partial<Parameters<ReturnType<typeof createRanker>["rank"]>[0]> = {},
): number {
  return (
    createRanker().rank({
      candidates: [item],
      evidence: [],
      query: "deterministic ranking",
      observedAt,
      ...changes,
    }).pages[0]?.score ?? 0
  );
}

test("RANK-001 tokenizes multilingual queries, quoted phrases, and technical identifiers lexically", () => {
  const analysis = analyzeQuery('site:example.test "API client" café TypeScript SDK');
  expect(analysis.tokens).toEqual(["café", "typescript", "sdk"]);
  expect(analysis.quotedPhrases).toEqual(["api client"]);
});

test("RANK-001/011 ranking is deterministic and does not depend on a model", () => {
  const input = {
    candidates: [candidate("a"), candidate("b", { googlePosition: 1 })],
    evidence: [],
    query: "deterministic ranking",
    observedAt,
  };
  const ranker = createRanker();
  expect(JSON.stringify(ranker.rank(input))).toBe(JSON.stringify(ranker.rank(input)));
});

test("RANK-003 selects explicit high-coverage, high-position SERP candidates before rendering", () => {
  const selected = selectPreRenderCandidates(
    [
      candidate("weak", { title: "unrelated", snippet: "unrelated", googlePosition: 1 }),
      candidate("relevant", { googlePosition: 3 }),
      candidate("next", { googlePosition: 7 }),
    ],
    "deterministic ranking",
    "general",
    2,
  );
  expect(selected.map((item) => item.candidate.url.pathname)).toEqual(["/relevant", "/next"]);
});

test("RANK-004 each configured post-extraction component moves the score in its expected direction", () => {
  const baseline = candidate("base");
  expect(
    score(candidate("passage"), {
      evidence: [
        {
          text: "deterministic ranking",
          sourceUrl: new URL("https://example.test/passage"),
          trust: "external_untrusted",
        },
      ],
    }),
  ).toBeGreaterThan(score(baseline));
  expect(
    score(
      candidate("concept-low", {
        content: "unrelated ".repeat(200),
        headings: [],
        anchors: [],
        title: "unrelated",
      }),
    ),
  ).toBeLessThan(score(baseline));
  expect(
    score(candidate("type", { sourceType: "academic" }), { profile: "academic" }),
  ).toBeGreaterThan(
    score(candidate("type-other", { sourceType: "discussion" }), { profile: "academic" }),
  );
  expect(score(candidate("position", { googlePosition: 1 }))).toBeGreaterThan(
    score(candidate("position-low", { googlePosition: 8 })),
  );
  expect(
    score(
      candidate("quality-low", {
        content: "deterministic ranking",
        headings: [],
        hasAuthor: false,
        hasCitations: false,
        originalProvenance: false,
        boilerplateRatio: 1,
      }),
    ),
  ).toBeLessThan(score(baseline));
  expect(
    score(candidate("fresh", { publishedAt: new Date("2026-08-28T00:00:00Z") }), {
      query: "latest deterministic ranking",
    }),
  ).toBeGreaterThan(
    score(candidate("stale", { publishedAt: new Date("2024-01-01T00:00:00Z") }), {
      query: "latest deterministic ranking",
    }),
  );
});

test("RANK-005 missing publication dates are neutral outside and inside temporal queries", () => {
  expect(score(candidate("missing"), { query: "latest deterministic ranking" })).toBe(
    score(candidate("missing-two"), { query: "latest deterministic ranking" }),
  );
});

test("RANK-009 auto profile selection is deterministic and never removes discovery candidates", () => {
  expect(analyzeQuery("TypeScript SDK error").selectedProfile).toBe("technical");
  expect(analyzeQuery("latest breaking news").selectedProfile).toBe("news");
  expect(analyzeQuery("arxiv research paper").selectedProfile).toBe("academic");
  expect(analyzeQuery("reddit community discussion").selectedProfile).toBe("community");
  const result = createRanker().rank({
    candidates: [candidate("one"), candidate("two", { sourceType: "discussion" })],
    evidence: [],
    query: "reddit community discussion",
    observedAt,
  });
  expect(result.candidates).toHaveLength(2);
});

test("RANK-010 blends general and specialized score using configured weights", () => {
  const input = candidate("academic", { sourceType: "academic" });
  const general = score(input, { profile: "general" });
  const specialized = 0.7 * general + 0.3;
  expect(score(input, { profile: "academic" })).toBeCloseTo(0.7 * general + 0.3 * specialized, 12);
  const configured = structuredClone(defaultConfiguration);
  configured.experimental.general_profile_weight = 0.5;
  configured.experimental.specialized_profile_weight = 0.5;
  expect(
    createRanker(configured).rank({
      candidates: [input],
      evidence: [],
      query: "deterministic ranking",
      profile: "academic",
      observedAt,
    }).pages[0]?.score,
  ).toBeCloseTo(0.5 * general + 0.5 * specialized, 12);
});

test("RANK-002 post-extraction passages can rescore a page above its pre-render ordering", () => {
  const first = candidate("first", {
    googlePosition: 1,
    content: "deterministic ranking ".repeat(50),
  });
  const second = candidate("second", {
    googlePosition: 8,
    content: "deterministic ranking ".repeat(50),
  });
  const result = createRanker().rank({
    candidates: [first, second],
    evidence: [
      { text: "deterministic ranking", sourceUrl: second.url, trust: "external_untrusted" },
    ],
    query: "deterministic ranking",
    observedAt,
  });
  expect(result.candidates[0]?.candidate.url).toBe(first.url);
  expect(result.pages[0]?.candidate.url).toBe(second.url);
});

test("RANK-007/012 retains a weak lexical page with low confidence", () => {
  const weak = candidate("weak", {
    content: "deterministic ranking",
    headings: [],
    hasAuthor: false,
    hasCitations: false,
    originalProvenance: false,
    boilerplateRatio: 1,
    googlePosition: 20,
  });
  const page = createRanker().rank({
    candidates: [weak],
    evidence: [],
    query: "deterministic ranking",
    observedAt,
  }).pages[0];
  expect(page?.confidence).toBe("low");
});

test("RANK-004/TEST-019 diagnostics are opt-in and never leak into normal ranking output", () => {
  const input = {
    candidates: [candidate("one")],
    evidence: [],
    query: "deterministic ranking",
    observedAt,
  };
  const ranker = createRanker();
  expect(ranker.rank(input).diagnostics).toBeUndefined();
  const diagnostic = ranker.rank({ ...input, diagnostics: true }).diagnostics;
  expect(diagnostic?.weights.passage_weight).toBe(0.35);
  expect(JSON.stringify(ranker.rank(input))).not.toContain("googlePosition");
  expect(JSON.stringify(ranker.rank(input))).not.toContain("teacher");
});
