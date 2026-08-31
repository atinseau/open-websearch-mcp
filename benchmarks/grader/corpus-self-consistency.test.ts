import { expect, test } from "bun:test";

/**
 * Every acceptable pattern must match the passage the corpus captured for its
 * own claim. Measured on the 2026-08-30 corpus, none of the eight claims
 * carrying a captured passage satisfies this (ADR-0016): the WHATWG URL
 * Standard writes "single-dot URL path segment" where the pattern says
 * "single-dot path segment", and one pattern - `malformed \`%\` escapes` -
 * appears nowhere in the cited page's 729KB of HTML.
 *
 * A product returning the exact span the corpus points at therefore fails the
 * check the corpus applies to it, which is why evidence coverage cannot be
 * raised by any change to passage selection on those claims.
 *
 * This test records the count rather than demanding zero, so a corpus refresh
 * that fixes a claim makes it fail and the number gets updated deliberately.
 */
test("VER-001 the corpus's patterns are measured against its own passages", async () => {
  const cases = new Bun.Glob("*/fixture.json").scan({
    cwd: "benchmarks/teachers/fixtures/2026-08-30/cases",
    absolute: false,
  });
  let withPassage = 0;
  let selfConsistent = 0;
  for await (const entry of cases) {
    const fixture: unknown = await Bun.file(
      `benchmarks/teachers/fixtures/2026-08-30/cases/${entry}`,
    ).json();
    for (const claim of claimsOf(fixture)) {
      const captured = (claim.evidence_passages ?? []).map((passage) => passage.text).join(" ");
      if (!captured) continue;
      withPassage += 1;
      if (claim.acceptable_patterns.every((pattern) => new RegExp(pattern, "iu").test(captured)))
        selfConsistent += 1;
    }
  }

  expect(withPassage).toBe(8);
  // ADR-0016: none of them. Raise this when a corpus refresh earns it.
  expect(selfConsistent).toBe(0);
});

interface ClaimShape {
  readonly acceptable_patterns: readonly string[];
  readonly evidence_passages?: readonly { readonly text: string }[];
}

/** Reads a fixture's claims without trusting the file's shape. */
function claimsOf(fixture: unknown): readonly ClaimShape[] {
  if (typeof fixture !== "object" || fixture === null) return [];
  const claims: unknown = Reflect.get(fixture, "claims");
  return Array.isArray(claims) ? claims.filter(isClaim) : [];
}

function isClaim(value: unknown): value is ClaimShape {
  if (typeof value !== "object" || value === null) return false;
  const patterns: unknown = Reflect.get(value, "acceptable_patterns");
  return Array.isArray(patterns) && patterns.every((entry) => typeof entry === "string");
}
