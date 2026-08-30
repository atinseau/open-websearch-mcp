/** Drives the product's own `web_search` tool and shapes its answer for the grader. */
import { createProductionRoot } from "@/bootstrap";
import { resolveWorkspace } from "@/features/configuration";

import type { CaseResult, ResultPage } from "./grader.ts";

/** How the product's own tool terminated, so a block is never read as a low score. */
export type RunStatus = { status: string; reason: string | undefined };
export type ProductCaseResult = CaseResult & { run_status: RunStatus };

type ProductRoot = Awaited<ReturnType<typeof createProductionRoot>>;
let started: Promise<ProductRoot> | undefined;

/**
 * Runs one corpus question through the product and grades what it returned.
 * The runtime is built once and reused: a corpus run is many searches, and a
 * fresh renderer per question would measure startup rather than search.
 */
export async function searchWithProduct(
  caseId: string,
  question: string,
): Promise<ProductCaseResult> {
  // A benchmark run may be pointed at a scratch workspace, so a stale personal
  // config cannot silently decide what the corpus measures.
  started ??= createProductionRoot(
    Bun.env.OWS_WORKSPACE ? { workspace: resolveWorkspace(Bun.env.OWS_WORKSPACE) } : {},
  );
  const root = await started;
  const result = await root.tools.webSearch({ query: question, maxResults: 10 });
  return toCaseResult(caseId, result.structuredContent);
}

/** Releases the product runtime opened by `searchWithProduct`. */
export async function closeProduct(): Promise<void> {
  const running = started;
  started = undefined;
  if (running) await (await running).close();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The grader matches an expected passage by exact URL. A redirected page is
 * therefore appended under its final URL after every ranked page, so an
 * expected passage stays reachable without inflating the rank component.
 */
export function toCaseResult(caseId: string, structuredContent: unknown): ProductCaseResult {
  if (!isRecord(structuredContent) || !Array.isArray(structuredContent.results))
    throw new Error(`invalid web_search payload for case ${caseId}`);
  const ranked: ResultPage[] = [];
  const aliases: ResultPage[] = [];
  for (const entry of structuredContent.results) {
    const page = pageOf(caseId, entry);
    ranked.push(page.ranked);
    if (page.alias) aliases.push(page.alias);
  }
  return {
    case_id: caseId,
    results: [...ranked, ...aliases],
    run_status: runStatusOf(structuredContent),
  };
}

function pageOf(
  caseId: string,
  entry: unknown,
): { ranked: ResultPage; alias: ResultPage | undefined } {
  if (!isRecord(entry) || typeof entry.url !== "string" || !Array.isArray(entry.passages))
    throw new Error(`invalid web_search result for case ${caseId}`);
  const text = entry.passages.map(passageText).join("\n");
  const redirected = typeof entry.final_url === "string" && entry.final_url !== entry.url;
  return {
    ranked: {
      url: entry.url,
      text,
      token_count: typeof entry.token_count === "number" ? entry.token_count : undefined,
    },
    alias: redirected ? { url: String(entry.final_url), text, token_count: 0 } : undefined,
  };
}

function passageText(passage: unknown): string {
  return isRecord(passage) && typeof passage.text === "string" ? passage.text : "";
}

function runStatusOf(structuredContent: Record<string, unknown>): RunStatus {
  return {
    status: typeof structuredContent.status === "string" ? structuredContent.status : "unknown",
    reason: typeof structuredContent.reason === "string" ? structuredContent.reason : undefined,
  };
}
