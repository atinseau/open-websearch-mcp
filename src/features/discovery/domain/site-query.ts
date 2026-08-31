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

/**
 * Words with which a question asks for the newest version of a source rather
 * than any version of it. Kept here rather than imported from ranking, which
 * this feature must not reach into (ARCH-002).
 */
const currentWords = /\b(?:current|currently|latest|newest|now|today|up-to-date)\b/iu;

/** True when a question asks for what is current rather than for any version. */
export function asksForCurrent(query: string): boolean {
  return currentWords.test(query);
}

export function siteFollowUp(
  query: string,
  found: readonly URL[],
  intent: {
    readonly current?: boolean;
    /**
     * Release dates the results carry outside their paths - in a title or a
     * page's own text. A run only surfaces some of a site's versions, so the
     * newest among the paths is not the newest there is.
     */
    readonly versionsSeen?: readonly string[];
  } = {},
): string | undefined {
  if (/(?:^|\s)-?site:/iu.test(query)) return undefined;
  // A scoped ask narrows a search onto one site, which helps only when the
  // question is about that site's subject. A bare topic has no such subject,
  // and scoping it searches a site the question never named: measured on the
  // query `evidence`, the ask derived `site:cambridge.org evidence` - a
  // dictionary that happened to rank twice - and the call took 170 seconds
  // where the same call takes about 20.
  if (wordCount(query) < 3) return undefined;
  const host = dominantHost(found);
  if (host === undefined) return undefined;
  const reached = found.filter((url) => siteOf(url) === host);
  const version = intent.current ? newestVersion(reached, intent.versionsSeen ?? []) : undefined;
  // A question asking for what is current is only answered inside the release
  // it asked for: matching `/2025-06-18/server/tools` while the newest release
  // is `2026-07-28` reached the right page of the wrong version, and declaring
  // arrival there spent no ask and left the question unanswered.
  const answering = version ? reached.filter((url) => url.pathname.includes(version)) : reached;
  if (arrived(answering, host, query)) return undefined;
  return version ? `site:${host} ${version} ${query}` : `site:${host} ${query}`;
}

/**
 * The newest release the results themselves already name.
 *
 * A versioned documentation site keeps every release live under a dated path,
 * and engines index the older ones best: measured against
 * `modelcontextprotocol.io`, discovery returns `/2025-03-26/`, `/2025-06-18/`
 * and `/2025-11-25/` where the question asks for what is current, while the
 * same engines return `/2026-07-28/server/tools` when that date is named.
 *
 * The date is not invented. It is read off the sibling pages the engines did
 * return, so naming it asks about a version the search already found — the
 * same move as scoping to a host the search already found.
 */
function newestVersion(reached: readonly URL[], alsoSeen: readonly string[]): string | undefined {
  // A run surfaces only some of a site's versions, and the newest among those
  // is not the newest there is: measured across three runs of one question the
  // ask alternated between naming 2025-06-18 and 2026-07-28 depending on which
  // the first pass happened to return, and naming the older one cost that run
  // half its score. Dates the results carry elsewhere count too.
  const dates = [...reached.flatMap((url) => datedPath.exec(url.pathname)?.[1] ?? []), ...alsoSeen];
  return dates.length > 0 ? dates.sort().at(-1) : undefined;
}

const datedPath = /\/((?:19|20)\d{2}-\d{2}-\d{2})(?:\/|$)/u;

/**
 * How many words a question is made of.
 *
 * Splitting on whitespace counts spaces, not words, and Japanese, Chinese and
 * Thai write without them. The corpus's Japanese question counted two that way
 * and was discarded as a bare topic, so the scoped pass never ran on it -
 * segmented as words it counts thirty-two, and it names its subject as plainly
 * as any English question does.
 *
 * Segmentation is left to the runtime's own word boundaries, so a
 * space-separated question counts exactly as it did before: `evidence` is
 * still one word and still too bare to scope.
 */
function wordCount(query: string): number {
  let words = 0;
  for (const piece of wordBoundaries.segment(query)) if (piece.isWordLike === true) words += 1;
  return words;
}

/**
 * Boundaries are read without naming a locale, because the question's language
 * is not known here and the runtime infers it from the text's own script.
 */
const wordBoundaries = new Intl.Segmenter(undefined, { granularity: "word" });

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
    const host = siteOf(url);
    if (generalPurposeHosts.test(host)) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  let best: { host: string; count: number } | undefined;
  for (const [host, count] of counts) if (!best || count > best.count) best = { host, count };
  // A single lead is a coincidence; two pages from one host is the results
  // agreeing that this domain is the subject's own home.
  return best && best.count > 1 ? best.host : undefined;
}

/**
 * The site a page belongs to, with a subdomain folded into it.
 *
 * A project's blog and its documentation are one source under two names, and
 * which of them a run happens to return says nothing about where the answer
 * lives. Measured on the Model Context Protocol question, one run returned two
 * blog posts and one documentation page, scoped onto
 * `blog.modelcontextprotocol.io` - which carries announcements, not the
 * specification asked about - and scored 22.5 where its neighbour scored 55.
 *
 * Only the registrable name is kept, so pages of one project count together
 * however they are served, and the ask goes to the site rather than to
 * whichever subdomain happened to lead.
 */
function siteOf(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^www\./u, "");
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  // A two-part public suffix such as `co.uk` or `github.io` keeps three labels.
  const tail = labels.slice(-2).join(".");
  return compoundSuffixes.has(tail) ? labels.slice(-3).join(".") : tail;
}

/**
 * Suffixes under which each name is a separate site. `mozilla.github.io` and
 * `someone-else.github.io` are unrelated projects, so folding them together
 * would scope one project's search onto another's pages.
 */
const compoundSuffixes = new Set([
  "co.uk",
  "com.au",
  "com.br",
  "co.jp",
  "github.io",
  "gitlab.io",
  "netlify.app",
  "pages.dev",
  "readthedocs.io",
  "vercel.app",
]);
