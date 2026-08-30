/** Assembles a teacher-corpus conformity report from graded cases. */
import {
  gradeCase,
  weights,
  type CaseResult,
  type CaseScore,
  type TeacherFixture,
} from "./grader.ts";
import { calibrationCaseIds, validationCaseIds } from "./split.ts";

/**
 * `product-search` grades what the product actually returned. The probe mode
 * feeds the grader source URLs with empty text: it proves URL/equivalence and
 * rank mechanics and cannot state anything about answer quality.
 */
export type ScoringMode = "product-search" | "offline-source-only-mechanics-probe";

export type CorpusEntry = { id: string; category: string; question?: string | undefined };
export type ExcludedClaim = { case_id: string; claim_id: string; reason: string };
export type RunStatus = { status: string; reason: string | undefined };
export type ReportScore = CaseScore & {
  category: string;
  split: "calibration" | "validation";
  run_status?: RunStatus | undefined;
};
export type GradedCaseResult = CaseResult & { run_status?: RunStatus | undefined };
export type Report = {
  schema_version: number;
  mode: ScoringMode;
  corpus_date: string;
  metric_weights: typeof weights;
  calibration_case_ids: readonly string[];
  validation_case_ids: readonly string[];
  scores: ReportScore[];
  corpus: {
    cases: number;
    cases_with_accepted_claims: number;
    accepted_claims: number;
    claims_with_url_located_evidence_passages: number;
  };
  excluded_claims: ExcludedClaim[];
  verdict: string;
  gates_release: false;
};

const missingPassage = "no URL-located evidence passage";

export function buildReport(input: {
  mode: ScoringMode;
  corpusDate: string;
  cases: readonly CorpusEntry[];
  fixtures: readonly TeacherFixture[];
  results: readonly GradedCaseResult[];
}): Report {
  const byCaseId = new Map(input.fixtures.map((fixture) => [fixture.case_id, fixture]));
  const resultsByCaseId = new Map(input.results.map((result) => [result.case_id, result]));
  const scores: ReportScore[] = [];
  const excluded: ExcludedClaim[] = [];
  let acceptedClaims = 0;
  let locatedClaims = 0;
  for (const entry of input.cases) {
    const fixture = byCaseId.get(entry.id);
    if (fixture === undefined) throw new Error(`missing teacher fixture for case ${entry.id}`);
    acceptedClaims += fixture.claims.length;
    for (const claim of fixture.claims) {
      if (claim.evidence_passages.length > 0) locatedClaims += 1;
      else excluded.push({ case_id: entry.id, claim_id: claim.id, reason: missingPassage });
    }
    const result = resultsByCaseId.get(entry.id) ?? { case_id: entry.id, results: [] };
    const graded = gradeCase(fixture, result);
    scores.push({
      category: entry.category,
      split: calibrationCaseIds.some((id) => id === entry.id) ? "calibration" : "validation",
      run_status: result.run_status,
      ...graded,
      // The probe's pages carry empty text by construction, and a case whose
      // search never completed has nothing to say about quality. Both would
      // otherwise publish a total that reads as a verdict on the product.
      ...(input.mode === "offline-source-only-mechanics-probe" || didNotSearch(result)
        ? { total: "unmeasurable" as const, classification: "unmeasurable" as const }
        : {}),
    });
  }
  return {
    schema_version: 1,
    mode: input.mode,
    corpus_date: input.corpusDate,
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
      claims_with_url_located_evidence_passages: locatedClaims,
    },
    excluded_claims: excluded,
    verdict: verdictFor(input.mode, acceptedClaims, locatedClaims, blockedCount(scores)),
    // The sample is far too small to arbitrate a release; see ADR-0006.
    gates_release: false,
  };
}

/**
 * Whether the product failed to complete a search at all.
 *
 * Only `blocked` and `error` qualify. `partial` and `no_relevant_results` are
 * completed searches — the first returned fewer results than requested, the
 * second found nothing relevant — and both are statements about quality that
 * the score exists to capture. Treating them as outages discarded most of the
 * corpus behind a status that is not a failure.
 */
function didNotSearch(subject: { run_status?: RunStatus | undefined }): boolean {
  const status = subject.run_status?.status;
  return status === "blocked" || status === "error";
}

function blockedCount(scores: readonly ReportScore[]): number {
  return scores.filter((score) => didNotSearch(score)).length;
}

function verdictFor(
  mode: ScoringMode,
  acceptedClaims: number,
  locatedClaims: number,
  blocked: number,
): string {
  if (mode === "offline-source-only-mechanics-probe") {
    return `not_gateable: source-only mechanics probe over ${acceptedClaims} accepted claims; it exercises URL, equivalence and rank mechanics and measures no answer quality.`;
  }
  const blockedNote =
    blocked === 0
      ? ""
      : ` ${blocked} case(s) did not complete a search and are blocked rather than badly answered.`;
  return `not_gateable: ${locatedClaims} of ${acceptedClaims} accepted claims carry a URL-located evidence passage; the measured scores are published for observation and never gate a release.${blockedNote}`;
}
