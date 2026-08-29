import { gradeCase, weights, type CaseResult, type TeacherFixture } from "./grader.ts";
import { assertCompleteSplit, calibrationCaseIds, validationCaseIds } from "./split.ts";

const root = new URL("../teachers/", import.meta.url);
const corpus = corpusValue(await Bun.file(new URL("corpus.json", root)).text());
assertCompleteSplit(corpus.cases.map((item) => item.id));
const scores = [];
let acceptedClaims = 0;
for (const entry of corpus.cases) {
  const fixture = fixtureValue(
    await Bun.file(new URL(`fixtures/2026-08-28/cases/${entry.id}/fixture.json`, root)).text(),
  );
  // This source-only probe is intentionally not a relevance claim: it proves deterministic
  // URL/equivalence and rank mechanics while exposing the corpus's absent passages.
  const urls = [
    ...new Set(
      fixture.claims.flatMap((claim) =>
        claim.sources.flatMap((source) => [source.url, ...source.equivalent_urls]),
      ),
    ),
  ].sort();
  acceptedClaims += fixture.claims.length;
  const result: CaseResult = {
    case_id: fixture.case_id,
    results: urls.map((url) => ({ url, text: "", token_count: 0 })),
  };
  scores.push({
    category: entry.category,
    split: calibrationCaseIds.some((id) => id === entry.id) ? "calibration" : "validation",
    ...gradeCase(fixture, result),
  });
}
const report = {
  schema_version: 1,
  mode: "offline-source-only-mechanics-probe",
  metric_weights: weights,
  calibration_case_ids: calibrationCaseIds,
  validation_case_ids: validationCaseIds,
  scores,
  corpus: {
    cases: scores.length,
    cases_with_accepted_claims: scores.filter(
      (score) => score.components.evidenceCoverage !== "unmeasurable",
    ).length,
    accepted_claims: acceptedClaims,
    claims_with_url_located_evidence_passages: 0,
  },
  verdict:
    "not_gateable: every accepted claim lacks a URL-located expected evidence passage; total conformity scores are therefore unmeasurable by design.",
};
const output = process.argv[2] ?? "benchmarks/grader/report.json";
await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));

function corpusValue(text: string): { cases: { id: string; category: string }[] } {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || !Array.isArray(value.cases)) throw new Error("invalid teacher corpus");
  return {
    cases: value.cases.map((entry) => {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.category !== "string")
        throw new Error("invalid teacher corpus case");
      return { id: entry.id, category: entry.category };
    }),
  };
}
function fixtureValue(text: string): TeacherFixture {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value.case_id !== "string" || !Array.isArray(value.claims))
    throw new Error("invalid teacher fixture");
  return { case_id: value.case_id, claims: value.claims.map(claimValue) };
}
function claimValue(value: unknown): TeacherFixture["claims"][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !Array.isArray(value.required_concepts) ||
    !Array.isArray(value.acceptable_patterns) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.evidence_passages) ||
    typeof value.weight !== "number"
  )
    throw new Error("invalid teacher claim");
  return {
    id: value.id,
    required_concepts: strings(value.required_concepts),
    acceptable_patterns: strings(value.acceptable_patterns),
    sources: value.sources.map(sourceValue),
    evidence_passages: value.evidence_passages.map(passageValue),
    weight: value.weight,
  };
}
function sourceValue(value: unknown): { url: string; equivalent_urls: string[] } {
  if (!isRecord(value) || typeof value.url !== "string" || !Array.isArray(value.equivalent_urls))
    throw new Error("invalid teacher source");
  return { url: value.url, equivalent_urls: strings(value.equivalent_urls) };
}
function passageValue(value: unknown): { url: string; text: string } {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.text !== "string")
    throw new Error("invalid evidence passage");
  return { url: value.url, text: value.text };
}
function strings(values: unknown[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") throw new Error("expected strings");
    result.push(value);
  }
  return result;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
