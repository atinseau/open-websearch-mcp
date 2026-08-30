import { expect, test } from "bun:test";

import { captureCorpusPassages } from "./capture-passages.ts";

const sealed = {
  schema_version: 1,
  case_id: "technical-robots-rfc",
  question: "How are robots.txt groups handled?",
  locale: "en-US",
  derived_by: "codex",
  verified_by: "grounding",
  verification_status: "accepted",
  claims: [
    {
      id: "c1",
      text: "Groups start with user-agent lines.",
      required_concepts: ["group-structure", "user-agent"],
      acceptable_patterns: ["groups? start(?:s)? with one or more user-agent lines"],
      sources: [{ url: "https://spec.test/robots", equivalent_urls: [] }],
      evidence_passages: [],
      weight: 1,
      provenance: { mode: "trace_grounded", codex_run: "run-1" },
    },
    {
      id: "c2",
      text: "A claim whose page says nothing useful.",
      required_concepts: ["absent-concept"],
      acceptable_patterns: ["never matches"],
      sources: [{ url: "https://spec.test/other", equivalent_urls: [] }],
      evidence_passages: [],
      weight: 1,
      provenance: { mode: "trace_grounded", codex_run: "run-1" },
    },
  ],
  rejected_claims: [],
};

const pages: Record<string, string> = {
  "https://spec.test/robots": [
    "Robots Exclusion Protocol",
    "",
    "Groups start with one or more user-agent lines, and the group-structure follows.",
    "",
    "An unrelated closing section.",
  ].join("\n"),
  "https://spec.test/other": "This page discusses something else entirely.",
};

function retrieve(url: string) {
  const content = pages[url];
  if (content === undefined) throw new Error(`unreachable: ${url}`);
  return Promise.resolve(content);
}

test("a claim whose cited page supports it gains a source-located evidence passage", async () => {
  const captured = await captureCorpusPassages([sealed], retrieve);

  const claim = captured.fixtures[0]?.claims[0];
  expect(claim?.evidence_passages).toHaveLength(1);
  const passage = claim?.evidence_passages[0];
  expect(passage?.url).toBe("https://spec.test/robots");
  // The grader matches by substring, so the passage has to appear verbatim.
  expect(pages["https://spec.test/robots"]).toContain(passage?.text ?? "\u0000");
});

test("a claim whose page supports nothing keeps an empty passage list and is reported", async () => {
  const captured = await captureCorpusPassages([sealed], retrieve);

  expect(captured.fixtures[0]?.claims[1]?.evidence_passages).toEqual([]);
  const excluded = captured.report.excluded.find((entry) => entry.claim_id === "c2");
  expect(excluded).toBeDefined();
  expect(excluded?.reason).toContain("absent-concept");
});

test("an unreachable page excludes its claim with a stated reason rather than failing", async () => {
  const captured = await captureCorpusPassages([sealed], (url: string) =>
    url === "https://spec.test/other"
      ? Promise.reject(new Error("host unreachable"))
      : retrieve(url),
  );

  expect(captured.fixtures[0]?.claims[0]?.evidence_passages).toHaveLength(1);
  const excluded = captured.report.excluded.find((entry) => entry.claim_id === "c2");
  expect(excluded?.reason).toContain("unreachable");
});

test("each captured passage is pinned to the content it came from", async () => {
  const captured = await captureCorpusPassages([sealed], retrieve);

  const provenance = captured.report.captured.find((entry) => entry.claim_id === "c1");
  expect(provenance?.url).toBe("https://spec.test/robots");
  // A page can change after capture; the hash is what lets a later reader tell.
  expect(provenance?.content_sha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(provenance?.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
});

test("claims keep their identity and weight, gaining only passages", async () => {
  const captured = await captureCorpusPassages([sealed], retrieve);

  const before = sealed.claims[0];
  const after = captured.fixtures[0]?.claims[0];
  expect(after).toBeDefined();
  // Everything except the passages must survive the capture untouched.
  expect({ ...after, evidence_passages: [] }).toEqual({ ...before, evidence_passages: [] });
});

test("the report states how many claims were captured out of the total", async () => {
  const captured = await captureCorpusPassages([sealed], retrieve);

  expect(captured.report.total_claims).toBe(2);
  expect(captured.report.captured).toHaveLength(1);
  expect(captured.report.excluded).toHaveLength(1);
});

test("the capture reaches nothing in the product", async () => {
  // A passage produced by the product could not honestly score the product.
  // Read the declarations rather than grepping for names: a string search is
  // satisfied by any spelling that avoids the literal.
  const source = await Bun.file(new URL("capture-passages.ts", import.meta.url)).text();

  const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu)].map((match) => match[1]);
  expect(imports).toEqual(["./passage-selection.ts"]);
  expect([...source.matchAll(/\bimport\s*\(/gu)]).toBeEmpty();
  expect(source).not.toContain("require(");
  // Retrieval is the caller's job, which is what keeps this offline-testable.
  expect(source).not.toContain("fetch(");
});
