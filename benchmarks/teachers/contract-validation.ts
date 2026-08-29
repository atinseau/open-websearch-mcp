import {
  array,
  exactRecord,
  record,
  requiredDate,
  requiredString,
  webUrl,
} from "./contract-json.ts";

const categories = [
  "technical_docs",
  "current_news",
  "academic_primary",
  "community_contradictory",
  "multilingual",
  "ambiguous_difficult",
] as const;
type Category = (typeof categories)[number];
export type TeacherCase = { id: string; question: string; locale: string; category: Category };
const categoryCounts: Record<Category, number> = {
  technical_docs: 6,
  current_news: 3,
  academic_primary: 3,
  community_contradictory: 3,
  multilingual: 3,
  ambiguous_difficult: 2,
};

function isCategory(value: string): value is Category {
  return categories.some((category) => category === value);
}

export function validateCorpus(value: unknown): {
  total: number;
  categories: typeof categoryCounts;
} {
  const corpus = exactRecord(value, "corpus", [
    "schema_version",
    "corpus_id",
    "created_at",
    "cases",
  ]);
  if (corpus.schema_version !== 1) throw new Error("corpus schema_version must be 1");
  requiredString(corpus.corpus_id, "corpus_id");
  requiredDate(corpus.created_at, "created_at");
  const cases = array(corpus.cases, "cases");
  if (cases.length !== 20) throw new Error(`cases must contain 20 entries, got ${cases.length}`);
  const ids = new Set<string>();
  const observed: Record<Category, number> = {
    technical_docs: 0,
    current_news: 0,
    academic_primary: 0,
    community_contradictory: 0,
    multilingual: 0,
    ambiguous_difficult: 0,
  };
  for (const [index, candidate] of cases.entries()) validateCase(candidate, index, ids, observed);
  for (const category of categories) {
    if (observed[category] !== categoryCounts[category]) {
      throw new Error(`${category} must contain ${categoryCounts[category]} cases`);
    }
  }
  return { total: cases.length, categories: categoryCounts };
}

function validateCase(
  candidate: unknown,
  index: number,
  ids: Set<string>,
  observed: Record<Category, number>,
): void {
  const item = exactRecord(candidate, `cases[${index}]`, ["id", "category", "locale", "question"]);
  const id = requiredString(item.id, `cases[${index}].id`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`cases[${index}].id must be a path-safe lowercase slug`);
  }
  if (ids.has(id)) throw new Error(`duplicate case id: ${id}`);
  ids.add(id);
  requiredString(item.question, `cases[${index}].question`);
  if (requiredString(item.locale, `cases[${index}].locale`).length < 2)
    throw new Error(`cases[${index}].locale must contain at least 2 characters`);
  const category = requiredString(item.category, `cases[${index}].category`);
  if (!isCategory(category)) throw new Error(`unknown category: ${category}`);
  observed[category] += 1;
}

export function teacherCases(value: unknown): TeacherCase[] {
  validateCorpus(value);
  return array(record(value, "corpus").cases, "cases").map((candidate, index) => {
    const item = record(candidate, `cases[${index}]`);
    const category = requiredString(item.category, `cases[${index}].category`);
    if (!isCategory(category)) throw new Error(`unknown category: ${category}`);
    return {
      id: requiredString(item.id, `cases[${index}].id`),
      question: requiredString(item.question, `cases[${index}].question`),
      locale: requiredString(item.locale, `cases[${index}].locale`),
      category,
    };
  });
}

export function validateTeacherRun(value: unknown): {
  provider: string;
  observations: number;
} {
  const run = exactRecord(value, "teacher run", [
    "schema_version",
    "run_id",
    "case_id",
    "provider",
    "model",
    "cli_version",
    "locale",
    "started_at",
    "duration_ms",
    "prompt_sha256",
    "queries",
    "tool_results",
    "opened_urls",
    "cited_urls",
    "selected_sources",
    "evidence_passages",
    "final_answer",
    "raw_trace",
    "policy_evidence",
    "isolation",
  ]);
  if (run.schema_version !== 1) throw new Error("teacher run schema_version must be 1");
  const provider = validateRunIdentity(run);
  validateRunEvidence(run);
  validateRunIsolation(run);
  return { provider, observations: 6 };
}

function validateRunIdentity(run: Record<string, unknown>): string {
  const provider = requiredString(run.provider, "provider");
  if (provider !== "codex" && provider !== "claude")
    throw new Error("provider must be codex or claude");
  for (const field of [
    "run_id",
    "case_id",
    "model",
    "cli_version",
    "locale",
    "started_at",
  ] as const) {
    requiredString(run[field], field);
  }
  if (!Number.isInteger(run.duration_ms) || Number(run.duration_ms) < 0) {
    throw new Error("duration_ms must be a non-negative integer");
  }
  if (typeof run.prompt_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(run.prompt_sha256)) {
    throw new Error("prompt_sha256 must be a SHA-256 digest");
  }
  if (String(run.locale).length < 2) throw new Error("locale must contain at least 2 characters");
  requiredDate(run.started_at, "started_at", true);
  return provider;
}

function validateRunEvidence(run: Record<string, unknown>): void {
  array(run.queries, "queries", true).forEach((query, index) =>
    requiredString(query, `queries[${index}]`),
  );
  array(run.tool_results, "tool_results").forEach((candidate, index) => {
    const result = exactRecord(candidate, `tool_results[${index}]`, ["tool", "summary"]);
    requiredString(result.tool, `tool_results[${index}].tool`);
    requiredString(result.summary, `tool_results[${index}].summary`);
  });
  validateUrls(run.opened_urls, "opened_urls", true);
  validateUrls(run.cited_urls, "cited_urls");
  validateSources(run.selected_sources);
  validatePassages(run.evidence_passages, true);
  requiredString(run.final_answer, "final_answer");
  if (run.raw_trace !== "events.sanitized.jsonl") {
    throw new Error("raw_trace must reference the canonical adjacent trace");
  }
  if (run.policy_evidence !== "policy.json") {
    throw new Error("policy_evidence must reference the canonical adjacent policy");
  }
}

function validateUrls(value: unknown, label: string, allowEmpty = false): void {
  array(value, label, allowEmpty).forEach((candidate, index) =>
    webUrl(candidate, `${label}[${index}]`),
  );
}

function validateSources(value: unknown): void {
  array(value, "selected_sources").forEach((candidate, index) => {
    const source = exactRecord(candidate, `selected_sources[${index}]`, ["url", "title"]);
    webUrl(source.url, `selected_sources[${index}].url`);
    requiredString(source.title, `selected_sources[${index}].title`);
  });
}

function validatePassages(value: unknown, allowEmpty = false): void {
  array(value, "evidence_passages", allowEmpty).forEach((candidate, index) => {
    const passage = exactRecord(candidate, `evidence_passages[${index}]`, ["url", "text"]);
    webUrl(passage.url, `evidence_passages[${index}].url`);
    requiredString(passage.text, `evidence_passages[${index}].text`);
  });
}

function validateRunIsolation(run: Record<string, unknown>): void {
  const isolation = exactRecord(run.isolation, "isolation", [
    "temporary_cwd",
    "cwd_unchanged",
    "forbidden_tool_calls",
  ]);
  if (isolation.temporary_cwd !== true || isolation.cwd_unchanged !== true) {
    throw new Error("teacher run must prove an unchanged temporary cwd");
  }
  if (array(isolation.forbidden_tool_calls, "forbidden_tool_calls", true).length !== 0) {
    throw new Error("forbidden_tool_calls must be empty");
  }
}
