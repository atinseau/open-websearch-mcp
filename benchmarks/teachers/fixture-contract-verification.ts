import { array, exactRecord, record, requiredString, type JsonRecord } from "./contract-json.ts";

/** Claims a teacher verification accepted, and why it rejected the rest. */
export type Verification = { acceptedIds: string[]; rejectedById: Map<string, string> };

export function indexDraftClaims(value: unknown): Map<string, JsonRecord> {
  const claims = new Map<string, JsonRecord>();
  for (const [index, candidate] of array(value, "fixture draft claims").entries()) {
    const claim = record(candidate, `fixture draft claims[${index}]`);
    const id = requiredString(claim.id, `fixture draft claims[${index}].id`);
    if (claims.has(id)) throw new Error(`duplicate fixture draft claim id: ${id}`);
    claims.set(id, claim);
  }
  return claims;
}

export function parseVerification(value: unknown): Verification {
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

export function assertCompleteClassification(
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
