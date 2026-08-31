import { expect, test } from "bun:test";

import { siteFollowUp } from "./site-query.ts";

/**
 * An engine answers a question about a project with that project's front page,
 * and the page the question is actually about sits one level in. Measured live,
 * the PDF.js question returned `mozilla.github.io/pdf.js/` while the corpus
 * asks for `pdf.js/examples/`; the same terms scoped to the domain already
 * found returned that exact page first.
 *
 * The scope comes from a host the first pass already returned, so this asks the
 * same question of a source the engine itself chose, not a source invented here.
 */
test("a domain already found becomes the scope for a sharper second ask", () => {
  const follow = siteFollowUp("PDF.js outside extracting rendering", [
    new URL("https://mozilla.github.io/pdf.js/"),
    new URL("https://mozilla.github.io/pdf.js/index.html"),
    new URL("https://github.com/mozilla/pdf.js/"),
  ]);

  expect(follow).toBe("site:mozilla.github.io PDF.js outside extracting rendering");
});

test("a query the agent already scoped is left alone", () => {
  // SEARCH-001: the agent's own operators are its intent, never overridden.
  expect(
    siteFollowUp("site:example.com widgets", [new URL("https://mozilla.github.io/pdf.js/")]),
  ).toBeUndefined();
});

test("without a host to scope to there is nothing to ask", () => {
  expect(siteFollowUp("PDF.js rendering", [])).toBeUndefined();
});

/**
 * A scoped ask narrows a search onto one site, which only helps when the
 * question is about a particular source. A broad question has no such source,
 * and scoping it spends a navigation to search a site the question never named:
 * measured on the query "evidence", the ask derived
 * `site:cambridge.org evidence` - a dictionary - and the call took 170 seconds
 * where the same call takes about 20.
 *
 * A question of one or two ordinary words is a topic, not a source.
 */
test("a broad question is not narrowed onto whichever site happened to rank", () => {
  expect(
    siteFollowUp("evidence", [
      new URL("https://dictionary.cambridge.org/dictionary/english/evidence"),
      new URL("https://dictionary.cambridge.org/us/dictionary/english/evidence"),
      new URL("https://www.merriam-webster.com/dictionary/evidence"),
    ]),
  ).toBeUndefined();
});

test("a question naming a subject still earns its scoped ask", () => {
  expect(
    siteFollowUp("PDF.js outside extracting runtime", [
      new URL("https://docs.test/"),
      new URL("https://docs.test/start"),
    ]),
  ).toBe("site:docs.test PDF.js outside extracting runtime");
});

/**
 * A question written in a language without spaces is one long token to a
 * whitespace split. The corpus's Japanese question counts two, so it was read
 * as a bare topic and never earned the scoped pass, though it names a subject
 * as plainly as any English question does.
 *
 * What the rule means is whether the question says enough to name a source,
 * and that is a count of words, not of spaces.
 */
test("a question without spaces is still counted in words", () => {
  const question =
    "URL の国際化ドメイン名がブラウザーでどのように解析・表示されるか説明してください。";

  expect(
    siteFollowUp(question, [new URL("https://docs.test/"), new URL("https://docs.test/idna")]),
  ).toBe(`site:docs.test ${question}`);
});

/**
 * Aggregators and code hosts carry a project's material without being its
 * documentation, and scoping to one of them asks the wrong site. The host must
 * look like the subject's own home.
 */
test("a general-purpose host is not treated as a project's own site", () => {
  const follow = siteFollowUp("PDF.js rendering examples", [
    new URL("https://github.com/mozilla/pdf.js/"),
    new URL("https://stackoverflow.com/questions/1"),
    new URL("https://en.wikipedia.org/wiki/PDFjs"),
  ]);

  expect(follow).toBeUndefined();
});

test("the most frequent qualifying host wins, because agreement is evidence", () => {
  const follow = siteFollowUp("named subject terms", [
    new URL("https://one.example/a"),
    new URL("https://two.example/a"),
    new URL("https://two.example/b"),
  ]);

  expect(follow).toBe("site:two.example named subject terms");
});

/**
 * One page from a host is a coincidence, not a finding. Scoping to it would
 * spend a navigation narrowing the search onto whatever happened to rank once.
 */
test("a single page from a host is not enough to scope onto it", () => {
  expect(siteFollowUp("named subject terms", [new URL("https://one.example/a")])).toBeUndefined();
});

/**
 * A project's blog and its documentation are one source under two names, and
 * which of them a run happens to return decides nothing about where the answer
 * lives. Measured on the Model Context Protocol question, one run returned two
 * blog posts and one documentation page and scoped onto
 * `blog.modelcontextprotocol.io` — a subdomain that carries announcements, not
 * the specification the question asked about — and that run scored 22.5 where
 * its neighbour scored 55.
 *
 * Counting a site's pages together, and scoping to the site rather than to
 * whichever subdomain led, makes the ask the same one every run.
 */
test("a project's blog and its documentation count as one source", () => {
  const follow = siteFollowUp("version negotiation message framing", [
    new URL("https://blog.docs.test/posts/announcement"),
    new URL("https://blog.docs.test/posts/release"),
    new URL("https://docs.test/specification/2025-06-18"),
  ]);

  expect(follow).toBe("site:docs.test version negotiation message framing");
});

test("a version on any of a site's subdomains is a version it has", () => {
  const follow = siteFollowUp(
    "version negotiation message framing",
    [
      new URL("https://blog.docs.test/posts/2026-07-28/"),
      new URL("https://docs.test/specification/2025-06-18"),
    ],
    { current: true },
  );

  expect(follow).toBe("site:docs.test 2026-07-28 version negotiation message framing");
});

/**
 * A versioned documentation site keeps every release live under a dated path,
 * and search engines index the older ones best. Measured against
 * `modelcontextprotocol.io`, discovery returns `/2025-03-26/`, `/2025-06-18/`
 * and `/2025-11-25/` where the question asks for what is current — and the
 * same engines return `/2026-07-28/server/tools` when that date is named.
 *
 * The date is not invented: the results themselves carry it, on the sibling
 * pages the engines did return. Naming a version the search already found is
 * the same move as scoping to a host the search already found.
 */
test("a version the results already carry sharpens the scoped ask", () => {
  const follow = siteFollowUp(
    "version negotiation message framing",
    [
      new URL("https://docs.test/specification/2025-06-18/server/tools"),
      new URL("https://docs.test/specification/2026-07-28/basic/transports"),
    ],
    { current: true },
  );

  expect(follow).toBe("site:docs.test 2026-07-28 version negotiation message framing");
});

test("a question not asking for the current version names no version", () => {
  const follow = siteFollowUp("version negotiation message framing", [
    new URL("https://docs.test/specification/2025-06-18/server/tools"),
    new URL("https://docs.test/specification/2026-07-28/basic/transports"),
  ]);

  expect(follow).toBe("site:docs.test version negotiation message framing");
});

test("an undated site is scoped without a version, as before", () => {
  const follow = siteFollowUp(
    "named subject terms",
    [new URL("https://docs.test/a"), new URL("https://docs.test/b")],
    { current: true },
  );

  expect(follow).toBe("site:docs.test named subject terms");
});
