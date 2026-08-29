import { expect, test } from "bun:test";

import { assembleFixture, validateFixture } from "./contract.ts";
test("rejects fixture claims without trace-supported provenance", () => {
  const fixture = {
    schema_version: 1,
    case_id: "technical-bun-release",
    question: "What is the latest stable Bun release?",
    locale: "en-US",
    derived_by: "codex",
    verified_by: "claude",
    verification_status: "accepted",
    claims: [
      {
        id: "bun-version",
        text: "Bun v1.3.14 is stable.",
        required_concepts: ["Bun", "v1.3.14"],
        acceptable_patterns: ["Bun\\s+v?1\\.3\\.14"],
        sources: [
          {
            url: "https://bun.com/blog/bun-v1.3.14",
            equivalent_urls: ["https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14"],
          },
        ],
        evidence_passages: [
          {
            url: "https://bun.com/blog/bun-v1.3.14",
            text: "Bun v1.3.14 is now available.",
          },
        ],
        weight: 1,
        provenance: {
          mode: "trace_supported",
          codex_run: "2026-08-27_codex_technical-bun-release",
          claude_run: "2026-08-27_claude_technical-bun-release",
        },
      },
    ],
    rejected_claims: [],
  };

  expect(validateFixture(fixture)).toEqual({ claims: 1, total_weight: 1 });
  const unsupported = structuredClone(fixture);
  unsupported.claims[0]!.provenance.codex_run = "";
  expect(() => validateFixture(unsupported)).toThrow("codex_run must not be empty");
  const oversized = structuredClone(fixture);
  oversized.claims[0]!.evidence_passages[0]!.text = "x".repeat(1201);
  expect(() => validateFixture(oversized)).toThrow("must not exceed 1200 characters");
  expect(() => validateFixture({ ...fixture, schema_version: 2 })).toThrow("schema_version");
  expect(() => validateFixture({ ...fixture, unexpected: true })).toThrow("unexpected property");
  const duplicate = structuredClone(fixture);
  duplicate.claims.push(structuredClone(duplicate.claims[0]!));
  expect(() => validateFixture(duplicate)).toThrow("duplicate fixture claim id");
});

test("permits the verifier to reject every draft claim without coercing acceptance", () => {
  const fixture = assembleFixture(
    { id: "case", question: "Question?", locale: "en-US" },
    "2026-08-27",
    { runs: [{ cited_urls: ["https://example.com"], evidence_passages: [] }] },
    {
      claims: [
        {
          id: "unsupported",
          text: "Unsupported claim.",
          required_concepts: ["unsupported"],
          acceptable_patterns: ["unsupported"],
          sources: [{ url: "https://example.com", equivalent_urls: [] }],
          evidence_passages: [],
          weight: 1,
        },
      ],
      rejected_claims: [],
    },
    {
      accepted_claim_ids: [],
      rejected_claims: [{ id: "unsupported", reason: "Not supported." }],
    },
  );
  expect(fixture.claims).toEqual([]);
  expect(fixture.rejected_claims).toEqual([
    { text: "Unsupported claim.", reason: "Not supported." },
  ]);
});

test("keeps only claims accepted by the deterministic grounding verifier", () => {
  const draft = {
    claims: [
      {
        id: "supported",
        text: "The source supports this claim.",
        required_concepts: ["source", "claim"],
        acceptable_patterns: ["(?i)source.*claim"],
        sources: [{ url: "https://example.com/source", equivalent_urls: [] }],
        evidence_passages: [
          { url: "https://example.com/source", text: "The source supports this claim." },
        ],
        weight: 1,
      },
      {
        id: "rejected",
        text: "This claim is too broad.",
        required_concepts: ["broad"],
        acceptable_patterns: ["broad"],
        sources: [{ url: "https://example.com/source", equivalent_urls: [] }],
        evidence_passages: [{ url: "https://example.com/source", text: "Narrow evidence only." }],
        weight: 1,
      },
    ],
    rejected_claims: [{ text: "An invented claim.", reason: "Absent from both traces." }],
  };
  const fixture = assembleFixture(
    { id: "case-id", question: "What is supported?", locale: "en-US" },
    "2026-08-27",
    {
      runs: [
        {
          cited_urls: ["https://example.com/source"],
          evidence_passages: [
            { url: "https://example.com/source", text: "The source supports this claim." },
            { url: "https://example.com/source", text: "Narrow evidence only." },
          ],
        },
      ],
    },
    draft,
    {
      accepted_claim_ids: ["supported"],
      rejected_claims: [{ id: "rejected", reason: "The evidence is narrower." }],
    },
  );

  expect(fixture.claims).toHaveLength(1);
  expect(fixture.verified_by).toBe("grounding");
  expect(fixture.claims[0]!.provenance).toEqual({
    mode: "trace_grounded",
    codex_run: "2026-08-27_codex_case-id",
  });
  expect(fixture.claims[0]!.acceptable_patterns).toEqual(["source.*claim"]);
  expect(fixture.rejected_claims).toEqual([
    { text: "An invented claim.", reason: "Absent from both traces." },
    { text: "This claim is too broad.", reason: "The evidence is narrower." },
  ]);
});

test("normalizes harmless non-ECMAScript pattern escapes", () => {
  const fixture = assembleFixture(
    { id: "case", question: "Question?", locale: "en-US" },
    "2026-08-27",
    {
      runs: [
        {
          cited_urls: ["https://example.com"],
          evidence_passages: [{ url: "https://example.com", text: "Evidence." }],
        },
      ],
    },
    {
      claims: [
        {
          id: "claim",
          text: "A claim.",
          required_concepts: ["claim"],
          acceptable_patterns: ["\\%2e"],
          sources: [{ url: "https://example.com", equivalent_urls: [] }],
          evidence_passages: [{ url: "https://example.com", text: "Evidence." }],
          weight: 1,
        },
      ],
      rejected_claims: [],
    },
    { accepted_claim_ids: ["claim"], rejected_claims: [] },
  );

  expect(fixture.claims[0]?.acceptable_patterns).toEqual(["%2e"]);
});

test("rejects accepted fixture evidence absent from teacher runs", () => {
  const draft = {
    claims: [
      {
        id: "unsupported",
        text: "A claim.",
        required_concepts: ["claim"],
        acceptable_patterns: ["claim"],
        sources: [{ url: "https://example.com", equivalent_urls: [] as string[] }],
        evidence_passages: [{ url: "https://example.com", text: "Invented passage." }],
        weight: 1,
      },
    ],
    rejected_claims: [],
  };
  expect(() =>
    assembleFixture(
      { id: "case", question: "Question?", locale: "en-US" },
      "2026-08-27",
      {
        runs: [
          {
            cited_urls: ["https://example.com"],
            evidence_passages: [{ url: "https://example.com", text: "Observed passage." }],
          },
        ],
      },
      draft,
      { accepted_claim_ids: ["unsupported"], rejected_claims: [] },
    ),
  ).toThrow("passage is absent from teacher-run evidence");
  draft.claims[0]!.evidence_passages = [];
  draft.claims[0]!.sources[0]!.equivalent_urls = ["https://example.com/unobserved"];
  expect(() =>
    assembleFixture(
      { id: "case", question: "Question?", locale: "en-US" },
      "2026-08-27",
      { runs: [{ cited_urls: ["https://example.com"], evidence_passages: [] }] },
      draft,
      { accepted_claim_ids: ["unsupported"], rejected_claims: [] },
    ),
  ).toThrow("source is absent from teacher-run evidence");
  draft.claims[0]!.sources[0]!.equivalent_urls = [];
  draft.claims[0]!.sources[0]!.url = "https://example.com/path";
  expect(() =>
    assembleFixture(
      { id: "case", question: "Question?", locale: "en-US" },
      "2026-08-27",
      {
        runs: [
          {
            cited_urls: ["https://example.com/path-long"],
            final_answer: "Prose mentions https://example.com/path",
            selected_sources: [],
            evidence_passages: [],
          },
        ],
      },
      draft,
      { accepted_claim_ids: ["unsupported"], rejected_claims: [] },
    ),
  ).toThrow("source is absent from teacher-run evidence");
});
