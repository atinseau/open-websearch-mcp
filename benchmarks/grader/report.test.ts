import { expect, test } from "bun:test";

import { buildReport, type ScoringMode } from "./report.ts";
import type { TeacherFixture } from "./grader.ts";

const captured: TeacherFixture = {
  case_id: "technical-pdfjs",
  claims: [
    {
      id: "c1",
      required_concepts: ["alpha"],
      acceptable_patterns: ["alpha\\s+beta"],
      sources: [{ url: "https://spec.test/a", equivalent_urls: [] }],
      evidence_passages: [{ url: "https://spec.test/a", text: "alpha beta" }],
      weight: 1,
    },
  ],
};

const bare: TeacherFixture = {
  case_id: "technical-mcp-stdio",
  claims: [
    {
      id: "c1",
      required_concepts: ["alpha"],
      acceptable_patterns: ["alpha\\s+beta"],
      sources: [{ url: "https://spec.test/b", equivalent_urls: [] }],
      evidence_passages: [],
      weight: 1,
    },
  ],
};

function entry(id: string) {
  return { id, category: "technical_docs" };
}

test("a case whose claims carry passages is scored, not reported unmeasurable", () => {
  const report = buildReport({
    mode: "product-search",
    corpusDate: "2026-08-30",
    cases: [entry("technical-pdfjs")],
    fixtures: [captured],
    results: [
      {
        case_id: "technical-pdfjs",
        results: [{ url: "https://spec.test/a", text: "alpha beta", token_count: 20 }],
      },
    ],
  });

  const score = report.scores[0];
  expect(score?.components.extraction).not.toBe("unmeasurable");
  expect(score?.total).not.toBe("unmeasurable");
  expect(score?.classification).not.toBe("unmeasurable");
});

test("a case whose claims carry no passages stays unmeasurable", () => {
  const report = buildReport({
    mode: "product-search",
    corpusDate: "2026-08-30",
    cases: [entry("technical-mcp-stdio")],
    fixtures: [bare],
    results: [
      {
        case_id: "technical-mcp-stdio",
        results: [{ url: "https://spec.test/b", text: "alpha beta", token_count: 20 }],
      },
    ],
  });

  expect(report.scores[0]?.total).toBe("unmeasurable");
});

test("the report states its sample size and names every excluded claim", () => {
  const report = buildReport({
    mode: "product-search",
    corpusDate: "2026-08-30",
    cases: [entry("technical-pdfjs"), entry("technical-mcp-stdio")],
    fixtures: [captured, bare],
    results: [
      {
        case_id: "technical-pdfjs",
        results: [{ url: "https://spec.test/a", text: "alpha beta", token_count: 20 }],
      },
      { case_id: "technical-mcp-stdio", results: [] },
    ],
  });

  // A score without its sample size invites overstatement.
  expect(report.corpus.accepted_claims).toBe(2);
  expect(report.corpus.claims_with_url_located_evidence_passages).toBe(1);
  expect(report.excluded_claims).toEqual([
    { case_id: "technical-mcp-stdio", claim_id: "c1", reason: "no URL-located evidence passage" },
  ]);
});

test("the mechanics probe is labelled so it cannot pass for a quality measurement", () => {
  const probe: ScoringMode = "offline-source-only-mechanics-probe";
  const report = buildReport({
    mode: probe,
    corpusDate: "2026-08-28",
    cases: [entry("technical-mcp-stdio")],
    fixtures: [bare],
    results: [{ case_id: "technical-mcp-stdio", results: [] }],
  });

  expect(report.mode).toBe(probe);
  expect(report.verdict).toContain("mechanics");
});

test("the probe reports no total, even where a populated corpus would let it compute one", () => {
  // Its pages carry empty text by construction, so any total it could produce
  // would measure the corpus, not the product.
  const report = buildReport({
    mode: "offline-source-only-mechanics-probe",
    corpusDate: "2026-08-30",
    cases: [entry("technical-pdfjs")],
    fixtures: [captured],
    results: [
      {
        case_id: "technical-pdfjs",
        results: [{ url: "https://spec.test/a", text: "", token_count: 0 }],
      },
    ],
  });

  expect(report.scores[0]?.total).toBe("unmeasurable");
  expect(report.scores[0]?.components.sourceRecall).not.toBe("unmeasurable");
});

test("a case the product could not run is reported with its blocking reason", () => {
  const report = buildReport({
    mode: "product-search",
    corpusDate: "2026-08-30",
    cases: [entry("technical-pdfjs")],
    fixtures: [captured],
    results: [
      {
        case_id: "technical-pdfjs",
        results: [],
        run_status: { status: "blocked", reason: "captcha" },
      },
    ],
  });

  // A blocked run and a bad answer are different failures; conflating them
  // would read a discovery outage as poor search quality.
  expect(report.scores[0]?.run_status).toEqual({ status: "blocked", reason: "captcha" });
  expect(report.verdict).toContain("blocked");
});

test("a blocked case scores unmeasurable rather than a near-zero total", () => {
  const report = buildReport({
    mode: "product-search",
    corpusDate: "2026-08-30",
    cases: [entry("technical-pdfjs")],
    fixtures: [captured],
    results: [
      {
        case_id: "technical-pdfjs",
        results: [],
        run_status: { status: "blocked", reason: "captcha" },
      },
    ],
  });

  // Scoring a search that never ran would report a discovery outage as a
  // quality verdict, and the empty-result total is not zero but the full
  // token-budget award.
  expect(report.scores[0]?.total).toBe("unmeasurable");
  expect(report.scores[0]?.classification).toBe("unmeasurable");
});

test("promotion stays refused whatever the score", () => {
  const report = buildReport({
    mode: "product-search",
    corpusDate: "2026-08-30",
    cases: [entry("technical-pdfjs")],
    fixtures: [captured],
    results: [
      {
        case_id: "technical-pdfjs",
        results: [{ url: "https://spec.test/a", text: "alpha beta", token_count: 20 }],
      },
    ],
  });

  expect(report.gates_release).toBeFalse();
});
