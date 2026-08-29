import { createRanker } from "@/features/ranking";

const fixturePath = new URL("../fixtures/beir-scifact/test-018-subset.json", import.meta.url);
const observedAt = new Date("2026-08-29T00:00:00.000Z");

interface Fixture {
  readonly qrels: readonly Qrel[];
  readonly queries: Readonly<Record<string, string>>;
  readonly documents: Readonly<Record<string, Document>>;
}

interface Qrel {
  readonly queryId: string;
  readonly corpusId: string;
  readonly relevance: number;
}

interface Document {
  readonly title: string;
  readonly text: string;
}

export interface SciFactEvaluation {
  readonly dataset: "BEIR SciFact test";
  readonly offline: true;
  readonly qrels: number;
  readonly queries: number;
  readonly documents: number;
  readonly mrrAt10: number;
  readonly recallAt10: number;
  readonly cases: readonly { readonly queryId: string; readonly reciprocalRank: number }[];
}

/** Evaluates the shipped lexical ranker against unmodified public qrels, offline. */
export async function evaluateSciFact(): Promise<SciFactEvaluation> {
  const fixture = fixtureFrom(await Bun.file(fixturePath).json());
  const expected = qrelsByQuery(fixture.qrels);
  const ranker = createRanker();
  const cases = Object.entries(fixture.queries).map(([queryId, query]) => {
    const pages = ranker.rank({
      candidates: Object.entries(fixture.documents).map(([id, document], index) => ({
        url: new URL(`https://scifact.test/${id}`),
        sourceType: "academic" as const,
        title: document.title,
        content: document.text,
        headings: [document.title],
        googlePosition: index + 1,
        isNovel: true,
        hasAuthor: true,
        hasCitations: true,
        originalProvenance: true,
        boilerplateRatio: 0,
        extractable: true,
        supported: true,
      })),
      evidence: [],
      query,
      profile: "academic",
      observedAt,
    }).pages;
    const relevant = expected.get(queryId) ?? new Set<string>();
    const rank = pages.findIndex((page) => relevant.has(page.candidate.url.pathname.slice(1)));
    return { queryId, reciprocalRank: rank === -1 ? 0 : 1 / (rank + 1) };
  });
  return {
    dataset: "BEIR SciFact test",
    offline: true,
    qrels: fixture.qrels.length,
    queries: Object.keys(fixture.queries).length,
    documents: Object.keys(fixture.documents).length,
    mrrAt10: average(cases.map((item) => item.reciprocalRank)),
    recallAt10: average(cases.map((item) => Number(item.reciprocalRank > 0))),
    cases,
  };
}

function fixtureFrom(value: unknown): Fixture {
  if (
    !isRecord(value) ||
    !Array.isArray(value.qrels) ||
    !isRecord(value.queries) ||
    !isRecord(value.documents)
  )
    throw new Error("invalid SciFact fixture");
  return {
    qrels: value.qrels.map(qrelFrom),
    queries: strings(value.queries, "queries"),
    documents: Object.fromEntries(
      Object.entries(value.documents).map(([id, document]) => [id, documentFrom(document)]),
    ),
  };
}

function qrelFrom(value: unknown): Qrel {
  if (
    !isRecord(value) ||
    typeof value.queryId !== "string" ||
    typeof value.corpusId !== "string" ||
    typeof value.relevance !== "number"
  )
    throw new Error("invalid SciFact qrel");
  return { queryId: value.queryId, corpusId: value.corpusId, relevance: value.relevance };
}

function documentFrom(value: unknown): Document {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.text !== "string")
    throw new Error("invalid SciFact document");
  return { title: value.title, text: value.text };
}

function strings(value: Record<string, unknown>, label: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([id, text]) => {
      if (typeof text !== "string") throw new Error(`invalid SciFact ${label}`);
      return [id, text];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function qrelsByQuery(qrels: readonly Qrel[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const qrel of qrels) {
    if (qrel.relevance <= 0) continue;
    const relevant = result.get(qrel.queryId) ?? new Set<string>();
    relevant.add(qrel.corpusId);
    result.set(qrel.queryId, relevant);
  }
  return result;
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
