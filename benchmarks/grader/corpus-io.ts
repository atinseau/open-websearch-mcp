/** Loads and validates the versioned teacher corpus and its dated fixtures. */
import type { TeacherFixture } from "./grader.ts";
import type { CorpusEntry } from "./report.ts";

const root = new URL("../teachers/", import.meta.url);

export function corpusDateValue(value: string | undefined): string {
  const parsed = value === undefined ? Number.NaN : Date.parse(value);
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed))
    throw new Error("expected teacher corpus date as YYYY-MM-DD");
  if (new Date(parsed).toISOString().slice(0, 10) !== value)
    throw new Error("expected teacher corpus date as YYYY-MM-DD");
  return value;
}

export async function loadCases(): Promise<CorpusEntry[]> {
  const value: unknown = JSON.parse(await Bun.file(new URL("corpus.json", root)).text());
  if (!isRecord(value) || !Array.isArray(value.cases)) throw new Error("invalid teacher corpus");
  return value.cases.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.category !== "string")
      throw new Error("invalid teacher corpus case");
    return { id: entry.id, category: entry.category, question: questionOf(entry) };
  });
}

export async function loadFixture(corpusDate: string, caseId: string): Promise<TeacherFixture> {
  const file = Bun.file(new URL(`fixtures/${corpusDate}/cases/${caseId}/fixture.json`, root));
  const value: unknown = JSON.parse(await file.text());
  if (!isRecord(value) || typeof value.case_id !== "string" || !Array.isArray(value.claims))
    throw new Error("invalid teacher fixture");
  return { case_id: value.case_id, claims: value.claims.map(claimValue) };
}

/** The source URLs a claim accepts, used by the offline mechanics probe. */
export function claimSourceUrls(fixture: TeacherFixture): string[] {
  return [
    ...new Set(
      fixture.claims.flatMap((claim) =>
        claim.sources.flatMap((source) => [source.url, ...source.equivalent_urls]),
      ),
    ),
  ].sort();
}

function questionOf(entry: Record<string, unknown>): string | undefined {
  return typeof entry.question === "string" ? entry.question : undefined;
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
