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
  return host ? `site:${host} ${query}` : undefined;
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
