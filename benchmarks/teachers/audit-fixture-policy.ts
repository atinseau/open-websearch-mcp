import { array, record, requiredString } from "./contract-json.ts";
import { codexDisabledFeatures, codexSkillControls } from "./policy-controls.ts";
import { assertCommandPair, assertSuccessfulPolicy } from "./audit-case-policy.ts";

/**
 * Proves the fixture was derived by a Codex run with tools, skills, and Web
 * search disabled. A derivation that could reach the network or invoke tools
 * could not be reproduced from its archived inputs alone.
 */
export function assertDerivationPolicy(policy: unknown, caseId: string): void {
  const derivationPolicy = record(policy, "fixture derivation policy");
  assertSuccessfulPolicy(derivationPolicy, "codex", caseId);
  if (derivationPolicy.model !== "gpt-5.4") {
    throw new Error(`${caseId} fixture derivation used an unexpected model`);
  }
  const controls = record(derivationPolicy.controls, "fixture derivation controls");
  if (controls.tools_disabled !== true || controls.skills_disabled !== true)
    throw new Error(`${caseId} fixture derivation did not disable tools and skills`);
  const command = array(derivationPolicy.command, "fixture derivation command").map(
    (value, index) => requiredString(value, `fixture derivation command[${index}]`),
  );
  for (const control of ['web_search="disabled"', ...codexSkillControls]) {
    if (!command.includes(control)) {
      throw new Error(`${caseId} fixture derivation is missing policy control ${control}`);
    }
  }
  for (const feature of codexDisabledFeatures) assertCommandPair(command, "--disable", feature);
}

/**
 * Proves the fixture was verified by the deterministic grounding verifier and
 * that its recorded tallies match the verification it describes. A miscount
 * would let a fixture claim more accepted evidence than it holds.
 */
export function assertVerificationPolicy(
  policy: unknown,
  verification: unknown,
  caseId: string,
): void {
  const verificationPolicy = record(policy, "fixture verification policy");
  if (
    verificationPolicy.verifier !== "grounding" ||
    verificationPolicy.deterministic !== true ||
    verificationPolicy.uses_llm !== false ||
    verificationPolicy.uses_network !== false
  ) {
    throw new Error(`${caseId} fixture verification is not the deterministic verifier`);
  }
  const accepted = array(
    record(verification, "fixture verification").accepted_claim_ids,
    "accepted_claim_ids",
    true,
  ).length;
  const rejected = array(
    record(verification, "fixture verification").rejected_claims,
    "verification rejected_claims",
    true,
  ).length;
  if (verificationPolicy.accepted !== accepted || verificationPolicy.rejected !== rejected) {
    throw new Error(`${caseId} fixture verification policy miscounts its outcome`);
  }
}
