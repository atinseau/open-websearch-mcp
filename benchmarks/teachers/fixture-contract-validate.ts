import { array, exactRecord, record, requiredString, webUrl } from "./contract-json.ts";

export function validateFixture(value: unknown): { claims: number; total_weight: number } {
  const fixture = exactRecord(value, "fixture", [
    "schema_version",
    "case_id",
    "question",
    "locale",
    "derived_by",
    "verified_by",
    "verification_status",
    "claims",
    "rejected_claims",
  ]);
  if (fixture.schema_version !== 1) throw new Error("fixture schema_version must be 1");
  if (
    fixture.derived_by !== "codex" ||
    (fixture.verified_by !== "grounding" && fixture.verified_by !== "claude")
  ) {
    throw new Error("fixture must be derived by codex and verified by grounding or claude");
  }
  if (fixture.verification_status !== "accepted")
    throw new Error("verification_status must be accepted");
  requiredString(fixture.case_id, "case_id");
  requiredString(fixture.question, "question");
  if (requiredString(fixture.locale, "locale").length < 2)
    throw new Error("locale must contain at least 2 characters");
  let totalWeight = 0;
  const claims = array(fixture.claims, "claims", true);
  if (claims.length > 8) throw new Error("claims must contain at most 8 entries");
  const ids = new Set<string>();
  for (const [index, candidate] of claims.entries()) {
    totalWeight += validateClaim(candidate, index, ids);
  }
  array(fixture.rejected_claims, "rejected_claims", true).forEach((candidate, index) => {
    const rejected = exactRecord(candidate, `rejected_claims[${index}]`, ["text", "reason"]);
    requiredString(rejected.text, `rejected_claims[${index}].text`);
    requiredString(rejected.reason, `rejected_claims[${index}].reason`);
  });
  return { claims: claims.length, total_weight: totalWeight };
}

function validateClaim(candidate: unknown, index: number, ids: Set<string>): number {
  const claim = exactRecord(candidate, `claims[${index}]`, [
    "id",
    "text",
    "required_concepts",
    "acceptable_patterns",
    "sources",
    "evidence_passages",
    "weight",
    "provenance",
  ]);
  const id = requiredString(claim.id, `claims[${index}].id`);
  if (ids.has(id)) throw new Error(`duplicate fixture claim id: ${id}`);
  ids.add(id);
  requiredString(claim.text, `claims[${index}].text`);
  validateStringArray(claim.required_concepts, `claims[${index}].required_concepts`);
  validatePatterns(claim.acceptable_patterns, `claims[${index}].acceptable_patterns`);
  validateClaimSources(claim.sources, `claims[${index}].sources`);
  validateClaimPassages(claim.evidence_passages, `claims[${index}].evidence_passages`);
  if (typeof claim.weight !== "number" || claim.weight <= 0 || claim.weight > 5) {
    throw new Error(`claims[${index}].weight must be greater than 0 and at most 5`);
  }
  validateProvenance(claim.provenance, index);
  return claim.weight;
}

export function validateStringArray(value: unknown, label: string): void {
  array(value, label).forEach((item, index) => requiredString(item, `${label}[${index}]`));
}

function validatePatterns(value: unknown, label: string): void {
  array(value, label).forEach((pattern, index) => {
    const expression = requiredString(pattern, `${label}[${index}]`);
    try {
      RegExp(expression, "iu");
    } catch {
      throw new Error(`${label}[${index}] must be a valid regular expression`);
    }
  });
}

export function validateClaimSources(value: unknown, label: string): void {
  array(value, label).forEach((sourceValue, index) => {
    const source = exactRecord(sourceValue, `${label}[${index}]`, ["url", "equivalent_urls"]);
    webUrl(source.url, `${label}[${index}].url`);
    array(source.equivalent_urls, `${label}[${index}].equivalent_urls`, true).forEach(
      (equivalent, equivalentIndex) =>
        webUrl(equivalent, `${label}[${index}].equivalent_urls[${equivalentIndex}]`),
    );
  });
}

export function validateClaimPassages(value: unknown, label: string): void {
  array(value, label, true).forEach((passageValue, index) => {
    const passage = exactRecord(passageValue, `${label}[${index}]`, ["url", "text"]);
    webUrl(passage.url, `${label}[${index}].url`);
    if (requiredString(passage.text, `${label}[${index}].text`).length > 1200) {
      throw new Error(`${label}[${index}].text must not exceed 1200 characters`);
    }
  });
}

function validateProvenance(value: unknown, index: number): void {
  const label = `claims[${index}].provenance`;
  const provenance = record(value, label);
  const mode = provenance.mode;
  if (mode === "trace_grounded") {
    exactRecord(value, label, ["mode", "codex_run"]);
    requiredString(provenance.codex_run, "codex_run");
    return;
  }
  if (mode === "trace_supported" || mode === "mutually_validated") {
    exactRecord(value, label, ["mode", "codex_run", "claude_run"]);
    requiredString(provenance.codex_run, "codex_run");
    requiredString(provenance.claude_run, "claude_run");
    return;
  }
  throw new Error(`${label}.mode is invalid`);
}
