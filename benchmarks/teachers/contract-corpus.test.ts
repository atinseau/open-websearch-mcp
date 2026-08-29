import { expect, test } from "bun:test";

import { validateCorpus, validateTeacherRun } from "./contract.ts";

test("uses one provider-neutral Web research prompt", async () => {
  const prompt = await Bun.file(new URL("prompt.md", import.meta.url)).text();

  expect(prompt.match(/\{\{question\}\}/g)).toHaveLength(1);
  expect(prompt).toContain("native Web search");
  expect(prompt).toContain("Cite every factual claim");
  expect(prompt).not.toMatch(/site:|search exactly|queries|domains|results|steps/i);
});

test("versions machine-readable run and fixture schemas", async () => {
  const runSchema = await Bun.file(
    new URL("schemas/teacher-run.schema.json", import.meta.url),
  ).json();
  const fixtureSchema = await Bun.file(
    new URL("schemas/teacher-fixture.schema.json", import.meta.url),
  ).json();

  expect(runSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(runSchema.required).toContain("evidence_passages");
  expect(fixtureSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(fixtureSchema.properties.claims.items.required).toContain("provenance");
});

test("accepts the exact 20-case category split", async () => {
  const corpus = await Bun.file(new URL("corpus.json", import.meta.url)).json();

  expect(validateCorpus(corpus)).toEqual({
    total: 20,
    categories: {
      technical_docs: 6,
      current_news: 3,
      academic_primary: 3,
      community_contradictory: 3,
      multilingual: 3,
      ambiguous_difficult: 2,
    },
  });
});

test("rejects case IDs that can escape the corpus directory", async () => {
  const corpus = await Bun.file(new URL("corpus.json", import.meta.url)).json();
  corpus.cases[0].id = "../../escape";

  expect(() => validateCorpus(corpus)).toThrow("path-safe lowercase slug");
});

test("requires every observable field in a teacher run", () => {
  const run = {
    schema_version: 1,
    run_id: "2026-08-27_codex_technical-bun-release",
    case_id: "technical-bun-release",
    provider: "codex",
    model: "gpt-5.6",
    cli_version: "0.149.1",
    locale: "en-US",
    started_at: "2026-08-27T12:00:00Z",
    duration_ms: 1234,
    prompt_sha256: "a".repeat(64),
    queries: ["latest stable Bun release"],
    tool_results: [{ tool: "web_search", summary: "Official Bun result" }],
    opened_urls: ["https://bun.com/blog/bun-v1.3.14"],
    cited_urls: ["https://bun.com/blog/bun-v1.3.14"],
    selected_sources: [{ url: "https://bun.com/blog/bun-v1.3.14", title: "Bun v1.3.14" }],
    evidence_passages: [
      {
        url: "https://bun.com/blog/bun-v1.3.14",
        text: "Bun v1.3.14 is now available.",
      },
    ],
    final_answer: "Bun v1.3.14 is the latest stable release.",
    raw_trace: "events.sanitized.jsonl",
    policy_evidence: "policy.json",
    isolation: {
      temporary_cwd: true,
      cwd_unchanged: true,
      forbidden_tool_calls: [],
    },
  };

  expect(validateTeacherRun(run)).toEqual({ provider: "codex", observations: 6 });
  expect(() =>
    validateTeacherRun({ ...run, raw_trace: "../../unmanifested-events.jsonl" }),
  ).toThrow("canonical adjacent trace");
  expect(() => validateTeacherRun({ ...run, policy_evidence: "../../other.json" })).toThrow(
    "canonical adjacent policy",
  );
  expect(validateTeacherRun({ ...run, queries: [] })).toEqual({
    provider: "codex",
    observations: 6,
  });
  expect(() => validateTeacherRun({ ...run, schema_version: 2 })).toThrow("schema_version");
  expect(() => validateTeacherRun({ ...run, duration_ms: 1.5 })).toThrow("integer");
  expect(() => validateTeacherRun({ ...run, started_at: "2026-02-30T12:00:00Z" })).toThrow(
    "date-time",
  );
  expect(() => validateTeacherRun({ ...run, unexpected: true })).toThrow("unexpected property");
});
