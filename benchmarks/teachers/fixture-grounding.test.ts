import { expect, test } from "bun:test";

import { conceptGrounded, verifyDraftGrounding } from "./fixture-grounding.ts";

const evidence = {
  runs: [
    {
      final_answer:
        "BM25 is a probabilistic ranking function for document retrieval. It weights within-document term frequency and saturates it, and it normalizes by document length. See https://example.com/bm25.",
      queries: ["bm25 probabilistic ranking"],
      tool_results: [{ tool: "web_search", summary: "BM25 overview: https://example.com/bm25" }],
      opened_urls: ["https://example.com/bm25"],
      cited_urls: ["https://example.com/bm25"],
      selected_sources: [{ url: "https://example.com/bm25", title: "BM25" }],
      evidence_passages: [],
    },
  ],
};

function claim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "c1",
    text: "BM25 is a probabilistic ranking function for document retrieval.",
    required_concepts: ["probabilistic_ranking"],
    acceptable_patterns: ["probabilistic ranking"],
    sources: [{ url: "https://example.com/bm25", equivalent_urls: [] }],
    evidence_passages: [],
    weight: 1,
    ...overrides,
  };
}

function verify(overrides: Record<string, unknown> = {}): {
  accepted_claim_ids: string[];
  rejected_claims: { id: string; reason: string }[];
} {
  return verifyDraftGrounding(evidence, { claims: [claim(overrides)], rejected_claims: [] });
}

test("accepts a claim whose text, concepts, patterns, and source are observable", () => {
  expect(verify().accepted_claim_ids).toEqual(["c1"]);
});

test("grounds identifier-styled concepts by adjacency or local proximity", () => {
  // Adjacent: the evidence writes "probabilistic ranking" verbatim.
  expect(verify({ required_concepts: ["probabilistic_ranking"] }).accepted_claim_ids).toEqual([
    "c1",
  ]);
  // Not adjacent, but both words sit inside one sentence of the same answer.
  expect(verify({ required_concepts: ["document_ranking"] }).accepted_claim_ids).toEqual(["c1"]);
});

test("rejects concept tokens that only co-occur far apart", () => {
  const distant = {
    runs: [
      {
        final_answer: `saturation ${"x filler text ".repeat(60)} kubernetes`,
        queries: [],
        tool_results: [],
        opened_urls: ["https://example.com/bm25"],
        cited_urls: ["https://example.com/bm25"],
        selected_sources: [],
        evidence_passages: [],
      },
    ],
  };
  const result = verifyDraftGrounding(distant, {
    claims: [
      {
        id: "c1",
        text: "Saturation and kubernetes are unrelated here.",
        required_concepts: ["saturation_kubernetes"],
        acceptable_patterns: ["saturation"],
        sources: [{ url: "https://example.com/bm25", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
    rejected_claims: [],
  });

  expect(result.rejected_claims[0]?.reason).toContain("required concept is absent");
});

test("rejects a claim whose proposition is absent from the evidence", () => {
  const rejected = verify({
    text: "Kubernetes federation guarantees deterministic multi-cluster scheduling latency.",
  }).rejected_claims;

  expect(rejected[0]?.reason).toContain("claim text is not lexically grounded");
});

test("rejects a source the teacher run never observed", () => {
  const rejected = verify({
    sources: [{ url: "https://unrelated.example.org/page", equivalent_urls: [] }],
  }).rejected_claims;

  expect(rejected[0]?.reason).toContain("claim source is absent from teacher-run evidence");
});

test("rejects a grading pattern that matches nothing observable", () => {
  const rejected = verify({ acceptable_patterns: ["reranks? greedily"] }).rejected_claims;

  expect(rejected[0]?.reason).toContain("grading pattern matches no teacher-run evidence");
});

test("rejects an invalid grading pattern instead of throwing", () => {
  const rejected = verify({ acceptable_patterns: ["("] }).rejected_claims;

  expect(rejected[0]?.reason).toContain("not a valid regular expression");
});

test("classifies every claim exactly once and is deterministic", () => {
  const draft = {
    claims: [claim(), claim({ id: "c2", text: "Quantum tunnelling accelerates cache eviction." })],
    rejected_claims: [],
  };
  const first = verifyDraftGrounding(evidence, draft);
  const second = verifyDraftGrounding(evidence, draft);

  expect(first).toEqual(second);
  expect(first.accepted_claim_ids).toEqual(["c1"]);
  expect(first.rejected_claims.map((entry) => entry.id)).toEqual(["c2"]);
});
function groundingFor(
  finalAnswer: string,
  claimOverrides: Record<string, unknown>,
): { accepted_claim_ids: string[]; rejected_claims: { id: string; reason: string }[] } {
  return verifyDraftGrounding(
    {
      runs: [
        {
          final_answer: finalAnswer,
          queries: [],
          tool_results: [],
          opened_urls: ["https://example.com/bm25"],
          cited_urls: ["https://example.com/bm25"],
          selected_sources: [],
          evidence_passages: [],
        },
      ],
    },
    { claims: [claim(claimOverrides)], rejected_claims: [] },
  );
}

test("rejects a claim that inserts one invented distinctive word", () => {
  // Every other content word is quoted from the evidence; only "unicorn" is invented.
  const rejected = verify({
    text: "BM25 is a probabilistic ranking function for document unicorn.",
  }).rejected_claims;

  expect(rejected[0]?.reason).toContain("claim text is not lexically grounded");
});

test("does not ground a claim word by a longer word that merely contains it", () => {
  const rejected = groundingFor("Concatenate the ranking inputs before scoring.", {
    text: "The concat step accepts ranking inputs.",
    required_concepts: ["ranking"],
    acceptable_patterns: ["ranking"],
  }).rejected_claims;

  expect(rejected[0]?.reason).toContain("claim text is not lexically grounded");
});

test("measures the concept window between the outermost tokens", () => {
  const filler = (length: number) => "z".repeat(length);
  const claimOverrides = {
    text: "alpha anchor beta.",
    required_concepts: ["alpha_anchor_beta"],
    acceptable_patterns: ["alpha"],
  };

  // Outermost tokens span 150 characters: inside the 160-character window.
  expect(
    groundingFor(`beta ${filler(70)} alpha ${filler(60)} anchor`, claimOverrides)
      .accepted_claim_ids,
  ).toEqual(["c1"]);

  // Each outer token stays near "alpha", but the outermost span exceeds the
  // window. An anchor-relative check would wrongly accept this.
  expect(
    groundingFor(`beta ${filler(150)} alpha ${filler(150)} anchor`, claimOverrides)
      .rejected_claims[0]?.reason,
  ).toContain("required concept is absent");
});

test("finds a bounded concept window beyond the first occurrences", () => {
  const scattered = `beta ${"z".repeat(400)} alpha ${"z".repeat(400)} beta alpha`;

  expect(
    groundingFor(scattered, {
      text: "alpha beta.",
      required_concepts: ["alpha_beta"],
      acceptable_patterns: ["alpha"],
    }).accepted_claim_ids,
  ).toEqual(["c1"]);
});
test("does not ground a concept by a longer word that merely contains it", () => {
  const rejected = groundingFor("Concatenate the ranking inputs before scoring.", {
    text: "The ranking inputs are concatenate ready.",
    required_concepts: ["cat"],
    acceptable_patterns: ["ranking"],
  }).rejected_claims;

  expect(rejected[0]?.reason).toContain("required concept is absent");
});

test("rejects an equivalent source URL the teacher run never observed", () => {
  const rejected = verify({
    sources: [
      {
        url: "https://example.com/bm25",
        equivalent_urls: ["https://unrelated.example.org/mirror"],
      },
    ],
  }).rejected_claims;

  expect(rejected[0]?.reason).toContain("claim source is absent from teacher-run evidence");
});

test("finds a bounded window after many earlier occurrences of a token", () => {
  const noise = "alpha zzz ".repeat(600);
  const scattered = `${noise} alpha beta`;

  expect(
    groundingFor(scattered, {
      text: "alpha beta.",
      required_concepts: ["alpha_beta"],
      acceptable_patterns: ["alpha"],
    }).accepted_claim_ids,
  ).toEqual(["c1"]);
});

/**
 * The proximity window is a character count, so how a page is wrapped decides
 * whether a concept is grounded by it.
 *
 * The adjacency rule hides this for most concepts — its separator is any run
 * of non-alphanumeric characters, so `entry` and `points` two hundred newlines
 * apart are still adjacent. The window is only consulted when other *words*
 * sit between the tokens, and there a source file's wrapping and a collapsed
 * reading of the same text disagree.
 *
 * This matters because the two sides of the benchmark read differently:
 * `evidenceCoverage` grounds concepts in whitespace-collapsed text, while the
 * corpus capture grounds them in text that keeps its wrapping. The behaviour is
 * recorded rather than changed — see
 * ADR-0015 — and this test exists so it is not rediscovered by a probe that
 * normalises differently and appears to contradict the grader.
 */
test("the proximity window moves with how the text is wrapped", () => {
  const between = Array.from({ length: 22 }, () => "detail").join("\n        ");
  const wrapped = `entry\n        ${between}\n        points`;
  const collapsed = wrapped.replaceAll(/\s+/gu, " ");

  const grounded = (text: string) => conceptGrounded("entry-points", { text, urls: new Set() });

  expect(wrapped.length).toBeGreaterThan(collapsed.length);
  expect(grounded(wrapped)).toBe(false);
  expect(grounded(collapsed)).toBe(true);
});

/** Adjacency ignores separator length, which is why most concepts are stable. */
test("tokens separated only by whitespace stay adjacent however long it runs", () => {
  const text = `entry${"\n".repeat(200)}points`;

  expect(conceptGrounded("entry-points", { text, urls: new Set() })).toBe(true);
});
