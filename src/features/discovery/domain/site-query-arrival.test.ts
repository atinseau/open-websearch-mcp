import { expect, test } from "bun:test";

import { siteFollowUp } from "./site-query.ts";

/**
 * Whether a search has already reached the page it asked about, which decides
 * whether a scoped ask is worth a navigation at all. Kept apart from the tests
 * of which site to ask, because arrival is judged from the question's own terms
 * and from the release it asked for, not from the host.
 */

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

/**
 * Reaching a page whose path matches the question is not arriving when it is
 * the wrong release of that page. Measured on the Model Context Protocol
 * question, one run held /specification/2025-06-18/server/tools and
 * /specification/2026-07-28/basic/transports: "tools" matched, arrival was
 * declared, and the ask that would have found /2026-07-28/server/tools was
 * never spent. That run scored 22.5 where its neighbour scored 55.
 *
 * When a question asks for what is current, a match on an older release does
 * not answer it.
 */
test("matching an older release is not arriving at the current one", () => {
  const follow = siteFollowUp(
    "tools list negotiation",
    [
      new URL("https://docs.test/specification/2025-06-18/server/tools"),
      new URL("https://docs.test/specification/2026-07-28/basic/transports"),
    ],
    { current: true },
  );

  expect(follow).toBe("site:docs.test 2026-07-28 tools list negotiation");
});

test("matching within the newest release is arriving", () => {
  // The page asked about is in hand at the release asked for, so the ask would
  // spend a navigation to find what the search already has.
  const follow = siteFollowUp(
    "tools list negotiation",
    [
      new URL("https://docs.test/specification/2026-07-28/server/tools"),
      new URL("https://docs.test/specification/2026-07-28/basic/transports"),
    ],
    { current: true },
  );

  expect(follow).toBeUndefined();
});

/**
 * The newest release a run happens to return is not the newest release there
 * is. Measured on the Model Context Protocol question across three runs, the
 * ask alternated between naming 2025-06-18 and 2026-07-28 depending on which
 * versions the first pass had surfaced, and the run that named the older one
 * scored 22.5 where its neighbour scored 55.
 *
 * A release date is also written in a page's title and its own text, not only
 * in its path, and a site that publishes several versions links them. Taking
 * the newest date the results carry anywhere - not merely the newest among the
 * paths - makes the ask the same one every run.
 */
test("the newest release is taken from everything the results carry", () => {
  const follow = siteFollowUp(
    "version negotiation message framing",
    [
      new URL("https://docs.test/specification/2025-06-18/server/tools"),
      new URL("https://docs.test/specification/2025-06-18/basic"),
    ],
    { current: true, versionsSeen: ["2025-06-18", "2026-07-28"] },
  );

  expect(follow).toBe("site:docs.test 2026-07-28 version negotiation message framing");
});

test("without a newer release seen elsewhere the paths still decide", () => {
  const follow = siteFollowUp(
    "version negotiation message framing",
    [
      new URL("https://docs.test/specification/2025-06-18/server/tools"),
      new URL("https://docs.test/specification/2025-06-18/basic"),
    ],
    { current: true },
  );

  expect(follow).toBe("site:docs.test 2025-06-18 version negotiation message framing");
});
