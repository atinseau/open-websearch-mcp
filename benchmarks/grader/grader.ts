/** Deterministic, offline conformity grader for versioned teacher fixtures. */
import { conceptGrounded } from "../teachers/fixture-grounding.ts";

export const weights = {
  evidenceCoverage: 35,
  sourceRecall: 25,
  rank: 15,
  extraction: 10,
  diversity: 10,
  tokenBudget: 5,
} as const;

export type ComponentName = keyof typeof weights;
export type Measurement = number | "unmeasurable";
export type Classification =
  | "excellent"
  | "relevant"
  | "degraded"
  | "not_relevant"
  | "unmeasurable";

type Source = { url: string; equivalent_urls: string[] };
type Claim = {
  id: string;
  required_concepts: string[];
  acceptable_patterns: string[];
  sources: Source[];
  evidence_passages: { url: string; text: string }[];
  weight: number;
};
export type TeacherFixture = { case_id: string; claims: Claim[] };
export type ResultPage = { url: string; text: string; token_count?: number };
export type CaseResult = { case_id: string; results: ResultPage[] };
export type CaseScore = {
  case_id: string;
  components: Record<ComponentName, Measurement>;
  total: Measurement;
  classification: Classification;
  reasons: string[];
};

const tokenBudget = 6_000;

export function gradeCase(fixture: TeacherFixture, result: CaseResult): CaseScore {
  if (fixture.case_id !== result.case_id) throw new Error("fixture/result case ids differ");
  const claims = fixture.claims;
  const reasons: string[] = [];
  if (claims.length === 0) reasons.push("fixture contains no accepted claims");
  const denominator = claims.reduce((total, claim) => total + claim.weight, 0);
  const claimRatio = (predicate: (claim: Claim) => boolean): Measurement =>
    denominator === 0 ? "unmeasurable" : weighted(claims, predicate) / denominator;
  const components: Record<ComponentName, Measurement> = {
    evidenceCoverage: points(
      claimRatio((claim) => evidenceMatches(claim, result.results)),
      weights.evidenceCoverage,
    ),
    sourceRecall: points(
      claimRatio((claim) => sourceRanks(claim, result.results).length > 0),
      weights.sourceRecall,
    ),
    rank: points(rankRatio(claims, result.results, denominator), weights.rank),
    extraction: points(extractionRatio(claims, result.results, denominator), weights.extraction),
    diversity: points(diversityRatio(claims, result.results, denominator), weights.diversity),
    tokenBudget: points(tokenRatio(result.results), weights.tokenBudget),
  };
  if (components.extraction === "unmeasurable")
    reasons.push("no URL-located expected evidence passages");
  const total = Object.values(components).some((component) => component === "unmeasurable")
    ? "unmeasurable"
    : Object.values(components).reduce<number>((sum, component) => sum + Number(component), 0);
  return { case_id: fixture.case_id, components, total, classification: classify(total), reasons };
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

/**
 * Compares what a passage says, not how its source file wrapped it.
 *
 * The corpus captured its expected passages from page HTML, where a line break
 * inside a sentence carries the source file's own indentation; a browser
 * collapses that to one space. Measured on SQLite's FTS5 page, the two strings
 * differ only where the corpus has "extension or\n statically" and the
 * rendered page has "extension or\nstatically" - same words, same order, same
 * page - and the product scored zero for extraction on that difference alone.
 *
 * A capture that ends on a link also keeps the space the markup put around it,
 * so the corpus holds "compiling loadable extensions ." where the page reads
 * "compiling loadable extensions." - a space the browser never renders and the
 * reader never sees. On the same page that one character was the entire
 * difference between the expected passage and the returned one.
 *
 * Only whitespace is affected. Different words remain different.
 */
function flattened(value: string): string {
  return normalized(value)
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/ ([.,;:!?)\]])/gu, "$1")
    .replaceAll(/([([]) /gu, "$1")
    .trim();
}
/**
 * A concept is looked for the same way the capture step looked for it.
 *
 * The corpus labels concepts as identifiers such as `external-content`, which
 * no page writes that way. Matching them literally applied a stricter rule when
 * grading than the one used to accept the claim into the corpus, so a page that
 * plainly expressed a concept scored zero for evidence coverage.
 */
function evidenceMatches(claim: Claim, results: readonly ResultPage[]): boolean {
  const text = normalized(results.map((result) => result.text).join("\n"));
  const corpus = { text, urls: new Set(results.map((result) => result.url)) };
  return (
    claim.required_concepts.every((concept) => conceptGrounded(concept, corpus)) &&
    claim.acceptable_patterns.some((pattern) => new RegExp(unquoted(pattern), "iu").test(text))
  );
}

/**
 * Reads a pattern's backticks as the markup they are.
 *
 * A pattern quoting an identifier - `cannot be combined with \`path\` or
 * \`argv\`` - is quoting the page's Markdown source. A browser renders that as
 * code styling and drops the characters, so a product returning the very
 * sentence fails on punctuation no reader ever sees.
 *
 * Measured on `bun.com/docs/runtime/webview`, the product returns "cannot be
 * combined with path or argv" while the pattern requires the backticks; two of
 * that case's four claims fail this way on a page it renders and ranks first.
 *
 * Only the backtick is affected, and only where a pattern spells one
 * literally. Different words remain different.
 */
function unquoted(pattern: string): string {
  return pattern.replaceAll("\\`", "`").replaceAll("`", "`?");
}
/**
 * Hosts that serve the same documents under two names.
 *
 * Bun's documentation moved from `bun.sh` to `bun.com`; both still answer, and
 * the two responses are byte-identical (307,391 characters, verified against
 * the live pages). The sealed corpus cites the older name, so without this a
 * product returning the very page the corpus points at scores zero — measuring
 * a rename rather than recall.
 *
 * Deliberately a fixed list, not a heuristic: only hosts observed to mirror
 * each other belong here, and the path must still match exactly.
 */
const mirroredHosts: ReadonlyArray<ReadonlySet<string>> = [new Set(["bun.sh", "bun.com"])];

function canonicalHost(hostname: string): string {
  const host = hostname.replace(/^www\./u, "");
  const mirror = mirroredHosts.find((group) => group.has(host));
  return mirror ? [...mirror].sort()[0]! : host;
}

/**
 * Compares the page a URL identifies, not the string that spells it.
 *
 * The corpus cites anchored URLs such as `.../#url-parsing`. A fragment is
 * never sent to the server, so a product returning the same document scored
 * zero for a difference that names a place inside the page rather than a
 * different page. Host case and a trailing slash are the same kind of
 * difference. The path itself is left alone: it does distinguish pages.
 */
function pageIdentity(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = canonicalHost(url.hostname.toLowerCase());
    if (url.pathname.length > 1 && url.pathname.endsWith("/"))
      url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return value;
  }
}

function sourceRanks(claim: Claim, results: readonly ResultPage[]): number[] {
  const accepted = new Set(
    claim.sources.flatMap((source) => [source.url, ...source.equivalent_urls].map(pageIdentity)),
  );
  return results.flatMap((result, index) =>
    accepted.has(pageIdentity(result.url)) ? [index + 1] : [],
  );
}
function rankRatio(
  claims: readonly Claim[],
  results: readonly ResultPage[],
  denominator: number,
): Measurement {
  if (denominator === 0) return "unmeasurable";
  return (
    claims.reduce((sum, claim) => {
      const rank = sourceRanks(claim, results)[0];
      return sum + (rank === undefined ? 0 : claim.weight / rank);
    }, 0) / denominator
  );
}
function extractionRatio(
  claims: readonly Claim[],
  results: readonly ResultPage[],
  denominator: number,
): Measurement {
  const passageClaims = claims.filter((claim) => claim.evidence_passages.length > 0);
  const passageWeight = passageClaims.reduce((sum, claim) => sum + claim.weight, 0);
  if (denominator === 0 || passageWeight === 0) return "unmeasurable";
  return (
    weighted(passageClaims, (claim) =>
      claim.evidence_passages.every((passage) =>
        results.some(
          (result) =>
            result.url === passage.url && flattened(result.text).includes(flattened(passage.text)),
        ),
      ),
    ) / passageWeight
  );
}
function diversityRatio(
  claims: readonly Claim[],
  results: readonly ResultPage[],
  denominator: number,
): Measurement {
  if (denominator === 0) return "unmeasurable";
  return (
    claimRatioByWeight(claims, (claim) => {
      const ranks = sourceRanks(claim, results);
      if (ranks.length === 0) return 0;
      const hosts = new Set(
        ranks.map((rank) => new URL(results[rank - 1]?.url ?? "https://invalid.test").host),
      );
      return hosts.size / ranks.length;
    }) / denominator
  );
}
function claimRatioByWeight(claims: readonly Claim[], score: (claim: Claim) => number): number {
  return claims.reduce((sum, claim) => sum + claim.weight * score(claim), 0);
}
function weighted(claims: readonly Claim[], predicate: (claim: Claim) => boolean): number {
  return claims.reduce((sum, claim) => sum + (predicate(claim) ? claim.weight : 0), 0);
}
function tokenRatio(results: readonly ResultPage[]): number {
  const used = results.reduce(
    (sum, result) => sum + (result.token_count ?? lexicalTokens(result.text)),
    0,
  );
  return Math.max(0, 1 - Math.max(0, used - tokenBudget) / tokenBudget);
}
function lexicalTokens(text: string): number {
  return normalized(text)
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean).length;
}
function points(ratio: Measurement, maximum: number): Measurement {
  return ratio === "unmeasurable" ? ratio : round(ratio * maximum);
}
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
export function classify(total: Measurement): Classification {
  if (total === "unmeasurable") return "unmeasurable";
  if (total >= 85) return "excellent";
  if (total >= 70) return "relevant";
  if (total >= 50) return "degraded";
  return "not_relevant";
}
