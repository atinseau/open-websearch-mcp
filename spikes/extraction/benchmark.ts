/**
 * SPK-004 extraction benchmark. It deliberately measures Obscura's own
 * rendered-Markdown output before considering a second extractor.
 *
 * Run: bun spikes/extraction/benchmark.ts docs/spikes/SPK-004/measurements.json
 */

export {};

type Claim = {
  readonly acceptable_patterns: readonly string[];
  readonly required_concepts: readonly string[];
  readonly sources: readonly { readonly url: string }[];
  readonly evidence_passages: readonly unknown[];
};

type Fixture = { readonly case_id: string; readonly claims: readonly Claim[] };

type Page = {
  readonly url: string;
  readonly cacheKey: string;
  readonly status: "ok" | "failed";
  readonly cached: boolean;
  readonly latencyMs: number;
  readonly markdownBytes: number;
  readonly markdownSha256: string;
  readonly headings: number;
  readonly links: number;
  readonly tables: number;
  readonly codeFences: number;
  readonly words: number;
  readonly peakChildRssKiB: number;
  readonly error?: string;
};

type ClaimResult = {
  readonly caseId: string;
  readonly sourceUrl: string;
  readonly patternsMatched: number;
  readonly patternsTotal: number;
  readonly conceptsMatched: number;
  readonly conceptsTotal: number;
  readonly passagesAvailable: number;
};

const outputPath = Bun.argv[2] ?? "docs/spikes/SPK-004/measurements.json";
const fixtureRoot = "benchmarks/teachers/fixtures/2026-08-28/cases";
const cacheRoot = "spikes/extraction/cache";
const obscura = Bun.which("obscura");

if (!obscura) throw new Error("obscura is not on PATH");
if (Bun.version !== "1.4.0") throw new Error(`expected Bun 1.4.0, got ${Bun.version}`);

const normalizeUrl = (url: string): string => {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
};

const cacheKey = (url: string): string => new Bun.CryptoHasher("sha256").update(url).digest("hex");
const count = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length;
const wordCount = (text: string): number => text.match(/[\p{L}\p{N}_-]+/gu)?.length ?? 0;
const conceptWords = (concept: string): readonly string[] =>
  concept
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
const containsConcept = (markdown: string, concept: string): boolean =>
  conceptWords(concept).every((word) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`,
      "iu",
    ).test(markdown),
  );

const readFixtures = async (): Promise<readonly Fixture[]> => {
  const fixtures: Fixture[] = [];
  const glob = new Bun.Glob("*/fixture.json");
  for await (const relativePath of glob.scan(fixtureRoot)) {
    fixtures.push((await Bun.file(`${fixtureRoot}/${relativePath}`).json()) as Fixture);
  }
  return fixtures.sort((left, right) => left.case_id.localeCompare(right.case_id));
};

const fetchMarkdown = async (url: string): Promise<Page> => {
  const key = cacheKey(url);
  const cachePath = `${cacheRoot}/${key}.md`;
  const metadataPath = `${cacheRoot}/${key}.json`;
  const cached = await Bun.file(cachePath).exists();
  const started = performance.now();
  let markdown = "";
  let error: string | undefined;
  let peakChildRssKiB = 0;

  if (cached) {
    markdown = await Bun.file(cachePath).text();
  } else {
    const child = Bun.spawn(
      [
        obscura,
        "fetch",
        "--dump",
        "markdown",
        "--timeout",
        "30",
        "--wait",
        "3",
        "--stealth",
        "--quiet",
        url,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const sampleRss = async (): Promise<void> => {
      try {
        const rss = await Bun.$`/bin/ps -o rss= -p ${child.pid}`.text();
        const observed = Number.parseInt(rss.trim(), 10);
        if (Number.isFinite(observed)) peakChildRssKiB = Math.max(peakChildRssKiB, observed);
      } catch {
        // The child can exit between a sampling tick and ps; that is not a leak.
      }
    };
    const sampler = setInterval(() => void sampleRss(), 250);
    let stdout = "";
    let stderr = "";
    let exitCode = -1;
    try {
      [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
    } finally {
      clearInterval(sampler);
      await sampleRss();
      if (child.exitCode === null) child.kill("SIGTERM");
    }
    if (exitCode === 0) {
      markdown = stdout;
      await Bun.write(cachePath, markdown);
    } else {
      error = stderr.trim() || `obscura exited ${exitCode}`;
    }
    await Bun.write(
      metadataPath,
      `${JSON.stringify({ url, fetchedAt: new Date().toISOString(), exitCode, error }, null, 2)}\n`,
    );
  }

  const latencyMs = Math.round(performance.now() - started);
  const markdownBytes = new TextEncoder().encode(markdown).byteLength;
  return {
    url,
    cacheKey: key,
    status: error ? "failed" : "ok",
    cached,
    latencyMs,
    markdownBytes,
    markdownSha256: new Bun.CryptoHasher("sha256").update(markdown).digest("hex"),
    headings: count(markdown, /^#{1,6}\s+/gm),
    links: count(markdown, /!?\[[^\]]*\]\([^\s)]+(?:\s+[^)]*)?\)/g),
    tables: count(markdown, /^\|.*\|\s*$/gm) > 1 ? 1 : 0,
    codeFences: count(markdown, /^```/gm) / 2,
    words: wordCount(markdown),
    peakChildRssKiB,
    error,
  };
};

const fixtures = await readFixtures();
const urls = [
  ...new Set(
    fixtures.flatMap((fixture) =>
      fixture.claims.flatMap((claim) => claim.sources.map((source) => normalizeUrl(source.url))),
    ),
  ),
].sort();
const pages: Page[] = [];

for (const url of urls) {
  // Deliberately sequential: one request at a time and a persistent local cache.
  pages.push(await fetchMarkdown(url));
}

const markdownByUrl = new Map<string, string>();
for (const page of pages.filter((page) => page.status === "ok")) {
  markdownByUrl.set(page.url, await Bun.file(`${cacheRoot}/${page.cacheKey}.md`).text());
}

const claims: ClaimResult[] = [];
for (const fixture of fixtures) {
  for (const claim of fixture.claims) {
    for (const source of claim.sources) {
      const markdown = markdownByUrl.get(normalizeUrl(source.url)) ?? "";
      claims.push({
        caseId: fixture.case_id,
        sourceUrl: source.url,
        patternsMatched: claim.acceptable_patterns.filter((pattern) =>
          new RegExp(pattern, "iu").test(markdown),
        ).length,
        patternsTotal: claim.acceptable_patterns.length,
        conceptsMatched: claim.required_concepts.filter((concept) =>
          containsConcept(markdown, concept),
        ).length,
        conceptsTotal: claim.required_concepts.length,
        passagesAvailable: claim.evidence_passages.length,
      });
    }
  }
}

const values = (
  items: readonly number[],
): { readonly min: number; readonly median: number; readonly max: number } => {
  const sorted = [...items].sort((left, right) => left - right);
  return {
    min: sorted[0] ?? 0,
    median: sorted.length === 0 ? 0 : (sorted[Math.floor(sorted.length / 2)] ?? 0),
    max: sorted.at(-1) ?? 0,
  };
};

const successfulPages = pages.filter((page) => page.status === "ok");
const result = {
  schemaVersion: 1,
  spike: "SPK-004",
  baseline: "obscura-native-rendered-markdown",
  startedAt: new Date().toISOString(),
  environment: {
    bun: Bun.version,
    obscura: (await Bun.$`${obscura} --version`.text()).trim(),
    platform: (await Bun.$`/usr/bin/uname -sm`.text()).trim(),
  },
  corpus: {
    fixtureCount: fixtures.length,
    acceptedClaimCount: fixtures.reduce((total, fixture) => total + fixture.claims.length, 0),
    claimsWithEvidencePassages: claims.filter((claim) => claim.passagesAvailable > 0).length,
    sourceUrlCount: urls.length,
  },
  pages,
  claims,
  summary: {
    successfulPages: successfulPages.length,
    failedPages: pages.length - successfulPages.length,
    claimPatternCoverage: `${claims.reduce((total, claim) => total + claim.patternsMatched, 0)}/${claims.reduce((total, claim) => total + claim.patternsTotal, 0)}`,
    claimConceptCoverage: `${claims.reduce((total, claim) => total + claim.conceptsMatched, 0)}/${claims.reduce((total, claim) => total + claim.conceptsTotal, 0)}`,
    latencyMs: values(pages.map((page) => page.latencyMs)),
    markdownBytes: values(successfulPages.map((page) => page.markdownBytes)),
    headings: successfulPages.reduce((total, page) => total + page.headings, 0),
    links: successfulPages.reduce((total, page) => total + page.links, 0),
    tables: successfulPages.reduce((total, page) => total + page.tables, 0),
    codeFences: successfulPages.reduce((total, page) => total + page.codeFences, 0),
    peakChildRssKiB: values(pages.map((page) => page.peakChildRssKiB)),
  },
};

await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary));
