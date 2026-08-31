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
  const follow = siteFollowUp("terms", [
    new URL("https://one.example/a"),
    new URL("https://two.example/a"),
    new URL("https://two.example/b"),
  ]);

  expect(follow).toBe("site:two.example terms");
});

/**
 * One page from a host is a coincidence, not a finding. Scoping to it would
 * spend a navigation narrowing the search onto whatever happened to rank once.
 */
test("a single page from a host is not enough to scope onto it", () => {
  expect(siteFollowUp("terms", [new URL("https://one.example/a")])).toBeUndefined();
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
    "negotiation framing",
    [
      new URL("https://docs.test/specification/2025-06-18/server/tools"),
      new URL("https://docs.test/specification/2026-07-28/basic/transports"),
    ],
    { current: true },
  );

  expect(follow).toBe("site:docs.test 2026-07-28 negotiation framing");
});

test("a question not asking for the current version names no version", () => {
  const follow = siteFollowUp("negotiation framing", [
    new URL("https://docs.test/specification/2025-06-18/server/tools"),
    new URL("https://docs.test/specification/2026-07-28/basic/transports"),
  ]);

  expect(follow).toBe("site:docs.test negotiation framing");
});

test("an undated site is scoped without a version, as before", () => {
  const follow = siteFollowUp(
    "terms",
    [new URL("https://docs.test/a"), new URL("https://docs.test/b")],
    { current: true },
  );

  expect(follow).toBe("site:docs.test terms");
});
/**
 * Neither the number of candidates nor how deep they sit says whether the
 * question was answered. Measured live, the PDF.js search reached
 * `pdf.js/getting_started/` - inside the site, one level down - while the page
 * it asked about, `examples/`, was absent. Depth said "already there"; the
 * search had not arrived.
 *
 * What the question asks for is written in its own terms, and a documentation
 * site says what a page is about in its path. So the test is whether any page
 * found on that host carries a term the question used.
 */
test("a source found without any page matching the question earns the scoped ask", () => {
  const follow = siteFollowUp("PDF.js examples node", [
    new URL("https://docs.test/"),
    new URL("https://docs.test/getting_started/"),
  ]);

  expect(follow).toBe("site:docs.test PDF.js examples node");
});

test("a source whose pages already answer the question needs no scoped ask", () => {
  // `examples` is one of the question's own terms, and a page on the host
  // carries it: the search arrived, and asking again would spend a navigation.
  const follow = siteFollowUp("PDF.js examples node", [
    new URL("https://docs.test/"),
    new URL("https://docs.test/examples/"),
  ]);

  expect(follow).toBeUndefined();
});

test("a term too common to identify a page does not count as arrival", () => {
  // Every documentation site has a `docs` path; matching it would declare
  // arrival everywhere.
  const follow = siteFollowUp("widget docs configuration", [
    new URL("https://docs.test/"),
    new URL("https://docs.test/docs/"),
  ]);

  expect(follow).toBe("site:docs.test widget docs configuration");
});
