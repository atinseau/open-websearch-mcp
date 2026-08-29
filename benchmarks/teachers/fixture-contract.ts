import {
  array,
  exactRecord,
  record,
  requiredDate,
  requiredString,
  type JsonRecord,
  webUrl,
} from "./contract-json.ts";

type Verification = { acceptedIds: string[]; rejectedById: Map<string, string> };
type EvidenceSupport = { urls: Set<string>; passagesByUrl: Map<string, string[]> };
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

/**
 * Parses the archived Claude verification envelope of the sealed historical
 * refresh. ADR-0006 removed Claude from current captures; this remains only so
 * the retained pre-decision corpus stays auditable.
 */
export function verificationFromLegacyClaudeEnvelope(
  value: unknown,
  expectedModel: string,
): unknown {
  const envelope = record(value, "Claude verification envelope");
  assertLegacyClaudeCompletion(envelope);
  assertLegacyClaudeUsage(envelope, expectedModel);
  assertLegacyClaudePolicy(envelope);
  assertLegacyClaudeOutput(envelope);
  return envelope.structured_output;
}

function assertLegacyClaudeCompletion(envelope: JsonRecord): void {
  if (envelope.type !== "result" || envelope.subtype !== "success" || envelope.is_error !== false || envelope.terminal_reason !== "completed") throw new Error("Claude verification envelope did not complete successfully");
}

function assertLegacyClaudeUsage(envelope: JsonRecord, expectedModel: string): void {
  const modelUsage = record(envelope.modelUsage, "Claude verification model usage");
  if (!(expectedModel in modelUsage)) throw new Error(`Claude verification envelope does not prove model ${expectedModel}`);
  const usage = record(modelUsage[expectedModel], `Claude verification model usage for ${expectedModel}`);
  const input = [usage.inputTokens, usage.cacheReadInputTokens, usage.cacheCreationInputTokens];
  if (input.some((count) => !Number.isInteger(count) || Number(count) < 0) || input.reduce<number>((total, count) => total + Number(count), 0) === 0 || !Number.isInteger(usage.outputTokens) || Number(usage.outputTokens) <= 0) throw new Error(`Claude verification envelope has invalid ${expectedModel} token usage`);
}

function assertLegacyClaudePolicy(envelope: JsonRecord): void {
  const usage = record(envelope.usage, "Claude verification usage");
  if (Object.values(record(usage.server_tool_use, "Claude verification server tool usage")).some((count) => count !== 0)) throw new Error("Claude verification used a server tool");
  if (array(envelope.permission_denials, "Claude verification permission denials", true).length) throw new Error("Claude verification attempted a denied tool");
  if (record(envelope.subagent_stats, "Claude verification subagent stats").spawned !== 0) throw new Error("Claude verification spawned a subagent");
}

function assertLegacyClaudeOutput(envelope: JsonRecord): void {
  try {
    const rendered = JSON.parse(requiredString(envelope.result, "Claude verification result"));
    if (JSON.stringify(envelope.structured_output) !== JSON.stringify(rendered)) throw new Error("Claude verification outputs disagree");
  } catch (error) {
    if (error instanceof Error && error.message === "Claude verification outputs disagree") throw error;
    throw new Error("Claude verification result is not JSON", { cause: error });
  }
}

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

function validateStringArray(value: unknown, label: string): void {
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

function validateClaimSources(value: unknown, label: string): void {
  array(value, label).forEach((sourceValue, index) => {
    const source = exactRecord(sourceValue, `${label}[${index}]`, ["url", "equivalent_urls"]);
    webUrl(source.url, `${label}[${index}].url`);
    array(source.equivalent_urls, `${label}[${index}].equivalent_urls`, true).forEach(
      (equivalent, equivalentIndex) =>
        webUrl(equivalent, `${label}[${index}].equivalent_urls[${equivalentIndex}]`),
    );
  });
}

function validateClaimPassages(value: unknown, label: string): void {
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

function indexDraftClaims(value: unknown): Map<string, JsonRecord> {
  const claims = new Map<string, JsonRecord>();
  for (const [index, candidate] of array(value, "fixture draft claims").entries()) {
    const claim = record(candidate, `fixture draft claims[${index}]`);
    const id = requiredString(claim.id, `fixture draft claims[${index}].id`);
    if (claims.has(id)) throw new Error(`duplicate fixture draft claim id: ${id}`);
    claims.set(id, claim);
  }
  return claims;
}

function parseVerification(value: unknown): Verification {
  const verification = exactRecord(value, "fixture verification", [
    "accepted_claim_ids",
    "rejected_claims",
  ]);
  const acceptedIds = array(verification.accepted_claim_ids, "accepted_claim_ids", true).map(
    (id, index) => requiredString(id, `accepted_claim_ids[${index}]`),
  );
  if (new Set(acceptedIds).size !== acceptedIds.length)
    throw new Error("accepted_claim_ids must be unique");
  const rejectedById = new Map<string, string>();
  for (const [index, candidate] of array(
    verification.rejected_claims,
    "verification rejected_claims",
    true,
  ).entries()) {
    const rejected = exactRecord(candidate, `verification rejected_claims[${index}]`, [
      "id",
      "reason",
    ]);
    const id = requiredString(rejected.id, `verification rejected_claims[${index}].id`);
    if (rejectedById.has(id)) throw new Error(`duplicate verification rejection: ${id}`);
    rejectedById.set(
      id,
      requiredString(rejected.reason, `verification rejected_claims[${index}].reason`),
    );
  }
  return { acceptedIds, rejectedById };
}

function assertCompleteClassification(
  claims: Map<string, JsonRecord>,
  verification: Verification,
): void {
  const accepted = new Set(verification.acceptedIds);
  for (const id of [...accepted, ...verification.rejectedById.keys()]) {
    if (!claims.has(id)) throw new Error(`verification references unknown claim: ${id}`);
  }
  for (const id of claims.keys()) {
    if (accepted.has(id) && verification.rejectedById.has(id)) {
      throw new Error(`verification both accepts and rejects claim: ${id}`);
    }
    if (!accepted.has(id) && !verification.rejectedById.has(id)) {
      throw new Error(`verification omitted claim: ${id}`);
    }
  }
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

function evidenceSupport(value: unknown): EvidenceSupport {
  const evidence = record(value, "fixture evidence");
  const urls = new Set<string>();
  const passagesByUrl = new Map<string, string[]>();
  for (const [runIndex, runValue] of array(evidence.runs, "fixture evidence runs").entries()) {
    const run = record(runValue, `fixture evidence runs[${runIndex}]`);
    for (const field of ["opened_urls", "cited_urls"] as const) {
      for (const [index, urlValue] of array(
        run[field] ?? [],
        `fixture evidence runs[${runIndex}].${field}`,
        true,
      ).entries()) {
        urls.add(webUrl(urlValue, `fixture evidence runs[${runIndex}].${field}[${index}]`));
      }
    }
    for (const [sourceIndex, sourceValue] of array(
      run.selected_sources ?? [],
      `fixture evidence runs[${runIndex}].selected_sources`,
      true,
    ).entries()) {
      const source = record(
        sourceValue,
        `fixture evidence runs[${runIndex}].selected_sources[${sourceIndex}]`,
      );
      urls.add(
        webUrl(
          source.url,
          `fixture evidence runs[${runIndex}].selected_sources[${sourceIndex}].url`,
        ),
      );
    }
    for (const [passageIndex, passageValue] of array(
      run.evidence_passages ?? [],
      `fixture evidence runs[${runIndex}].evidence_passages`,
      true,
    ).entries()) {
      const passage = record(
        passageValue,
        `fixture evidence runs[${runIndex}].evidence_passages[${passageIndex}]`,
      );
      const url = webUrl(passage.url, "fixture evidence passage URL");
      urls.add(url);
      const texts = passagesByUrl.get(url) ?? [];
      texts.push(requiredString(passage.text, "fixture evidence passage text"));
      passagesByUrl.set(url, texts);
    }
  }
  return { urls, passagesByUrl };
}

function assertClaimSupported(claim: JsonRecord, support: EvidenceSupport, id: string): void {
  for (const [sourceIndex, sourceValue] of array(claim.sources, `claim ${id} sources`).entries()) {
    const source = record(sourceValue, `claim ${id} sources[${sourceIndex}]`);
    for (const url of [
      webUrl(source.url, `claim ${id} sources[${sourceIndex}].url`),
      ...array(
        source.equivalent_urls,
        `claim ${id} sources[${sourceIndex}].equivalent_urls`,
        true,
      ).map((value, index) =>
        webUrl(value, `claim ${id} sources[${sourceIndex}].equivalent_urls[${index}]`),
      ),
    ]) {
      if (!support.urls.has(url)) {
        throw new Error(`claim ${id} source is absent from teacher-run evidence: ${url}`);
      }
    }
  }
  for (const passageValue of array(
    claim.evidence_passages,
    `claim ${id} evidence_passages`,
    true,
  )) {
    if (!passageSupported(passageValue, support)) {
      throw new Error(`claim ${id} passage is absent from teacher-run evidence`);
    }
  }
}

function passageSupported(passageValue: unknown, support: EvidenceSupport): boolean {
  const passage = record(passageValue, "claim evidence passage");
  const url = webUrl(passage.url, "claim evidence passage URL");
  const text = requiredString(passage.text, "claim evidence passage text");
  return (support.passagesByUrl.get(url) ?? []).some((observed) => observed.includes(text));
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
