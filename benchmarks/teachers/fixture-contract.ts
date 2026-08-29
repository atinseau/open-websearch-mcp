import {
  array,
  exactRecord,
  record,
  requiredDate,
  requiredString,
  type JsonRecord,
} from "./contract-json.ts";
import { verificationFromLegacyClaudeEnvelope } from "./fixture-contract-legacy-claude.ts";
export { verificationFromLegacyClaudeEnvelope };
import {
  validateClaimPassages,
  validateClaimSources,
  validateFixture,
  validateStringArray,
} from "./fixture-contract-validate.ts";
export { validateFixture };
import {
  assertClaimSupported,
  evidenceSupport,
  passageSupported,
  type EvidenceSupport,
} from "./fixture-contract-support.ts";
import {
  assertCompleteClassification,
  indexDraftClaims,
  parseVerification,
} from "./fixture-contract-verification.ts";

/**
 * `grounding` marks fixtures verified by the deterministic trace-grounding
 * check introduced in ADR-0006. `claude` is retained only for the sealed
 * historical refresh captured before that decision.
 */
type Verifier = "grounding" | "claude";
type Fixture = {
  schema_version: 1;
  case_id: string;
  question: string;
  locale: string;
  derived_by: "codex";
  verified_by: Verifier;
  verification_status: "accepted";
  claims: JsonRecord[];
  rejected_claims: { text: string; reason: string }[];
};

export function assembleFixture(
  teacherCaseValue: unknown,
  date: string,
  evidenceValue: unknown,
  draftValue: unknown,
  verificationValue: unknown,
): Fixture {
  requiredDate(date, "fixture date");
  const teacherCase = record(teacherCaseValue, "teacher case");
  const draft = record(draftValue, "fixture draft");
  const claims = indexDraftClaims(draft.claims);
  const verification = parseVerification(verificationValue);
  assertCompleteClassification(claims, verification);
  const caseId = requiredString(teacherCase.id, "teacher case id");
  const fixture: Fixture = {
    schema_version: 1,
    case_id: caseId,
    question: requiredString(teacherCase.question, "teacher case question"),
    locale: requiredString(teacherCase.locale, "teacher case locale"),
    derived_by: "codex",
    verified_by: "grounding",
    verification_status: "accepted",
    claims: assembleAcceptedClaims(
      claims,
      verification.acceptedIds,
      evidenceSupport(evidenceValue),
      date,
      caseId,
    ),
    rejected_claims: assembleRejectedClaims(draft, claims, verification.rejectedById),
  };
  validateFixture(fixture);
  return fixture;
}

export function assembleLegacyFixture(
  teacherCaseValue: unknown,
  date: string,
  draftValue: unknown,
  verificationValue: unknown,
): Fixture {
  requiredDate(date, "fixture date");
  const teacherCase = record(teacherCaseValue, "legacy teacher case");
  const draft = record(draftValue, "legacy fixture draft");
  const claims = indexDraftClaims(draft.claims);
  const verification = parseVerification(verificationValue);
  assertCompleteClassification(claims, verification);
  const caseId = requiredString(teacherCase.id, "legacy teacher case id");
  const fixture: Fixture = {
    schema_version: 1,
    case_id: caseId,
    question: requiredString(teacherCase.question, "legacy teacher case question"),
    locale: requiredString(teacherCase.locale, "legacy teacher case locale"),
    derived_by: "codex",
    verified_by: "claude",
    verification_status: "accepted",
    claims: verification.acceptedIds.map((id) => {
      const claim = claims.get(id);
      if (claim === undefined) throw new Error(`accepted legacy claim disappeared: ${id}`);
      return {
        ...claim,
        acceptable_patterns: array(
          claim.acceptable_patterns,
          `legacy claim ${id} acceptable_patterns`,
        ).map((pattern, index) =>
          requiredString(pattern, `legacy claim ${id} acceptable_patterns[${index}]`).replace(
            /^\(\?i\)/,
            "",
          ),
        ),
        provenance: {
          mode: "mutually_validated",
          codex_run: `${date}_codex_${caseId}`,
          claude_run: `${date}_claude_${caseId}`,
        },
      };
    }),
    rejected_claims: assembleRejectedClaims(draft, claims, verification.rejectedById),
  };
  validateFixture(fixture);
  return fixture;
}

export function validateDraftEvidence(evidenceValue: unknown, draftValue: unknown): void {
  const support = evidenceSupport(evidenceValue);
  const draft = exactRecord(draftValue, "fixture draft", ["claims", "rejected_claims"]);
  const claims = array(draft.claims, "fixture draft claims");
  if (claims.length > 8) throw new Error("fixture draft claims must contain at most 8 entries");
  const ids = new Set<string>();
  for (const [index, claimValue] of claims.entries()) {
    const label = `fixture draft claims[${index}]`;
    const claim = exactRecord(claimValue, label, [
      "id",
      "text",
      "required_concepts",
      "acceptable_patterns",
      "sources",
      "evidence_passages",
      "weight",
    ]);
    const id = requiredString(claim.id, `${label}.id`);
    if (ids.has(id)) throw new Error(`duplicate fixture draft claim id: ${id}`);
    ids.add(id);
    requiredString(claim.text, `${label}.text`);
    validateStringArray(claim.required_concepts, `${label}.required_concepts`);
    validateStringArray(claim.acceptable_patterns, `${label}.acceptable_patterns`);
    validateClaimSources(claim.sources, `${label}.sources`);
    validateClaimPassages(claim.evidence_passages, `${label}.evidence_passages`);
    if (typeof claim.weight !== "number" || claim.weight <= 0 || claim.weight > 5) {
      throw new Error(`${label}.weight must be greater than 0 and at most 5`);
    }
    assertClaimSupported(claim, support, id);
  }
  array(draft.rejected_claims, "fixture draft rejected_claims", true).forEach(
    (candidate, index) => {
      const rejected = exactRecord(candidate, `fixture draft rejected_claims[${index}]`, [
        "text",
        "reason",
      ]);
      requiredString(rejected.text, `fixture draft rejected_claims[${index}].text`);
      requiredString(rejected.reason, `fixture draft rejected_claims[${index}].reason`);
    },
  );
}

export function normalizeDraftEvidence(evidenceValue: unknown, draftValue: unknown): unknown {
  const support = evidenceSupport(evidenceValue);
  const draft = record(structuredClone(draftValue), "fixture draft");
  draft.claims = array(draft.claims, "fixture draft claims").map((claimValue, claimIndex) => {
    const claim = record(claimValue, `fixture draft claims[${claimIndex}]`);
    const sources = array(claim.sources, `fixture draft claims[${claimIndex}].sources`).map(
      (sourceValue, sourceIndex) => {
        const source = record(
          sourceValue,
          `fixture draft claims[${claimIndex}].sources[${sourceIndex}]`,
        );
        return {
          ...source,
          equivalent_urls: array(
            source.equivalent_urls,
            `fixture draft claims[${claimIndex}].sources[${sourceIndex}].equivalent_urls`,
            true,
          ).filter((url) => support.urls.has(String(url))),
        };
      },
    );
    const evidencePassages = array(
      claim.evidence_passages,
      `fixture draft claims[${claimIndex}].evidence_passages`,
      true,
    ).filter((passageValue) => passageSupported(passageValue, support));
    return { ...claim, sources, evidence_passages: evidencePassages };
  });
  return draft;
}

function assembleAcceptedClaims(
  claims: Map<string, JsonRecord>,
  acceptedIds: string[],
  support: EvidenceSupport,
  date: string,
  caseId: string,
): JsonRecord[] {
  return acceptedIds.map((id) => {
    const claim = claims.get(id);
    if (claim === undefined) throw new Error(`accepted claim disappeared: ${id}`);
    assertClaimSupported(claim, support, id);
    return {
      ...claim,
      acceptable_patterns: array(claim.acceptable_patterns, `claim ${id} acceptable_patterns`).map(
        (pattern, index) =>
          requiredString(pattern, `claim ${id} acceptable_patterns[${index}]`)
            .replace(/^\(\?i\)/, "")
            .replaceAll("\\%", "%"),
      ),
      provenance: {
        mode: "trace_grounded",
        codex_run: `${date}_codex_${caseId}`,
      },
    };
  });
}

function assembleRejectedClaims(
  draft: JsonRecord,
  claims: Map<string, JsonRecord>,
  rejectedById: Map<string, string>,
): { text: string; reason: string }[] {
  const rejected = array(draft.rejected_claims, "fixture draft rejected_claims", true).map(
    (candidate, index) => {
      const item = record(candidate, `fixture draft rejected_claims[${index}]`);
      return {
        text: requiredString(item.text, `fixture draft rejected_claims[${index}].text`),
        reason: requiredString(item.reason, `fixture draft rejected_claims[${index}].reason`),
      };
    },
  );
  for (const [id, reason] of rejectedById) {
    rejected.push({ text: requiredString(claims.get(id)?.text, `claim ${id} text`), reason });
  }
  return rejected;
}
