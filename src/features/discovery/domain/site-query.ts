/**
 * Asks the same question again, scoped to a source the engine already chose.
 *
 * An engine answers a question about a project with that project's front page,
 * and the page the question is actually about sits one level in: measured live,
 * the PDF.js question returned `mozilla.github.io/pdf.js/` where the expected
 * page is `pdf.js/examples/`, and the same terms scoped to that domain
 * returned the expected page first.
 *
 * This never replaces the agent's query. SEARCH-001 forbids silent rewriting,
 * so the authored text is always issued first and unchanged, and a query that
 * already carries a scope is left exactly as written. This is the conditional
 * further pass SEARCH-008 provides for, and the derived query is reported
 * rather than applied silently.
 */

/**
 * Hosts that carry a project's material without being its documentation.
 * Scoping to one of them asks the wrong site: it returns that aggregator's
 * other pages rather than the project's own.
 */
const generalPurposeHosts =
  /(^|\.)(?:github\.com|gitlab\.com|stackoverflow\.com|stackexchange\.com|wikipedia\.org|wikimedia\.org|reddit\.com|medium\.com|npmjs\.com|deepwiki\.com|youtube\.com|x\.com|twitter\.com|facebook\.com|linkedin\.com|quora\.com|blogspot\.com|wordpress\.com|substack\.com|dev\.to|hashnode\.dev)$/iu;

export function siteFollowUp(query: string, found: readonly URL[]): string | undefined {
  if (/(?:^|\s)-?site:/iu.test(query)) return undefined;
  const host = dominantHost(found);
  if (host === undefined) return undefined;
  const reached = found.filter((url) => url.hostname.toLowerCase() === host);
  if (arrived(reached, host, query)) return undefined;
  return `site:${host} ${query}`;
}

/**
 * Whether the source's own pages already include the one the question asks for.
 *
 * Neither the number of candidates nor how deep a page sits says this.
 * Measured live, the PDF.js search reached `pdf.js/getting_started/` - inside
 * the site, one level down - while the page it asked about, `examples/`, was
 * absent: depth said the search had arrived when it had not.
 *
 * A documentation site says what a page is about in its path, and the question
 * says what it wants in its own terms, so the two are compared. A term only
 * counts when it tells the source's pages apart: the subject's own name is in
 * the question and in every one of its paths - `pdf` in `/pdf.js/` and in
 * `/pdf.js/getting_started/` - so matching it would report arrival at the very
 * front page the search needs to get past. Terms every site uses for its own
 * structure are excluded for the same reason.
 */
function arrived(reached: readonly URL[], host: string, query: string): boolean {
  const paths = reached.map((url) => url.pathname.toLowerCase());
  return questionTerms(query).some(
    (term) =>
      !host.includes(term) &&
      paths.some((path) => path.includes(term)) &&
      !paths.every((path) => path.includes(term)),
  );
}

/** Path words every documentation site uses, which identify no page. */
const structuralTerms = new Set([
  "api",
  "blog",
  "doc",
  "docs",
  "documentation",
  "en",
  "guide",
  "guides",
  "html",
  "index",
  "latest",
  "learn",
  "main",
  "manual",
  "page",
  "pages",
  "reference",
  "site",
  "web",
  "www",
]);

function questionTerms(query: string): readonly string[] {
  const terms: string[] = [];
  for (const match of query.toLowerCase().matchAll(/[\p{L}\p{N}]{3,}/gu))
    if (!structuralTerms.has(match[0])) terms.push(match[0]);
  return terms;
}

/**
 * The host the results agree on. Agreement is the evidence that a domain is
 * the subject's own home rather than one page that happened to rank.
 */
function dominantHost(found: readonly URL[]): string | undefined {
  const counts = new Map<string, number>();
  for (const url of found) {
    const host = url.hostname.toLowerCase();
    if (generalPurposeHosts.test(host)) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  let best: { host: string; count: number } | undefined;
  for (const [host, count] of counts) if (!best || count > best.count) best = { host, count };
  // A single lead is a coincidence; two pages from one host is the results
  // agreeing that this domain is the subject's own home.
  return best && best.count > 1 ? best.host : undefined;
}
