import { selectEvidencePassage, type EvidencePassage } from "./passage-selection.ts";

/**
 * Rebuilds the extraction denominator the sealed corpus never had.
 *
 * The teacher run recorded which URLs it cited but never what those pages said:
 * its search tool runs server-side and returns nothing to the client. What the
 * page contains is a fact about the page, so retrieving it afresh is a
 * legitimate ground truth — the teacher still owns the choice of sources, which
 * `sourceRecall` and `rank` already score.
 *
 * Retrieval is injected. This module performs no I/O and reaches nothing in the
 * product, because a passage produced by the product could not honestly score
 * the product.
 */

/** A claim as the sealed corpus stores it, with everything the capture reads. */
export interface SealedClaim {
  readonly id: string;
  readonly required_concepts: readonly string[];
  readonly acceptable_patterns: readonly string[];
  readonly sources: readonly {
    readonly url: string;
    readonly equivalent_urls: readonly string[];
  }[];
  readonly evidence_passages: readonly EvidencePassage[];
  readonly [key: string]: unknown;
}

export interface SealedFixture {
  readonly case_id: string;
  readonly claims: readonly SealedClaim[];
  readonly [key: string]: unknown;
}

/** Where a captured passage came from, and when. */
export interface CaptureProvenance {
  readonly case_id: string;
  readonly claim_id: string;
  readonly url: string;
  readonly content_sha256: string;
  readonly captured_at: string;
}

export interface CaptureExclusion {
  readonly case_id: string;
  readonly claim_id: string;
  readonly reason: string;
}

export interface CaptureReport {
  readonly total_claims: number;
  readonly captured: readonly CaptureProvenance[];
  readonly excluded: readonly CaptureExclusion[];
}

export interface CaptureResult {
  readonly fixtures: readonly SealedFixture[];
  readonly report: CaptureReport;
}

/** Retrieves one page. Injected so the capture stays offline-testable. */
export type RetrievePage = (url: string) => Promise<string>;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Every URL a claim cites, the primary first so it is tried first. */
function citedUrls(claim: SealedClaim): readonly string[] {
  return claim.sources.flatMap((source) => [source.url, ...source.equivalent_urls]);
}

async function captureClaim(
  fixture: SealedFixture,
  claim: SealedClaim,
  retrieve: RetrievePage,
  now: () => Date,
): Promise<{
  readonly passages: readonly EvidencePassage[];
  readonly provenance?: CaptureProvenance;
  readonly exclusion?: CaptureExclusion;
}> {
  const reasons: string[] = [];
  for (const url of citedUrls(claim)) {
    let content: string;
    try {
      content = await retrieve(url);
    } catch (error) {
      reasons.push(`${url}: unreachable (${error instanceof Error ? error.message : "failed"})`);
      continue;
    }
    const selected = selectEvidencePassage(claim, { url, content });
    if (!selected.passage) {
      reasons.push(`${url}: ${selected.reason ?? "no supporting passage"}`);
      continue;
    }
    return {
      passages: [selected.passage],
      provenance: {
        case_id: fixture.case_id,
        claim_id: claim.id,
        url,
        content_sha256: await sha256(content),
        captured_at: now().toISOString(),
      },
    };
  }
  return {
    passages: [],
    exclusion: {
      case_id: fixture.case_id,
      claim_id: claim.id,
      reason: reasons.join("; ") || "claim cites no source",
    },
  };
}

/**
 * Enriches every accepted claim with the passage its cited page supports.
 *
 * A claim whose pages support nothing keeps an empty passage list. No scoring
 * code needs to know: `extractionRatio` already drops claims without passages
 * from both numerator and denominator, so an uncapturable claim lowers nothing.
 * What matters is that the report names it, so the published score states
 * plainly what it does and does not cover.
 */
export async function captureCorpusPassages(
  fixtures: readonly SealedFixture[],
  retrieve: RetrievePage,
  now: () => Date = () => new Date(),
): Promise<CaptureResult> {
  const enriched: SealedFixture[] = [];
  const captured: CaptureProvenance[] = [];
  const excluded: CaptureExclusion[] = [];
  let total = 0;

  for (const fixture of fixtures) {
    const claims: SealedClaim[] = [];
    for (const claim of fixture.claims) {
      total += 1;
      const outcome = await captureClaim(fixture, claim, retrieve, now);
      if (outcome.provenance) captured.push(outcome.provenance);
      if (outcome.exclusion) excluded.push(outcome.exclusion);
      claims.push({ ...claim, evidence_passages: outcome.passages });
    }
    enriched.push({ ...fixture, claims });
  }

  return { fixtures: enriched, report: { total_claims: total, captured, excluded } };
}
