import { expect, test } from "bun:test";
import { gradeCase, type TeacherFixture } from "./grader.ts";

/**
 * The corpus captured its expected passages from page HTML, where a line break
 * inside a sentence is followed by the source file's own indentation. A browser
 * collapses that to a single space, so a product returning the very sentence the
 * corpus points at failed an exact-substring test on invisible whitespace.
 *
 * Measured on SQLite's FTS5 page, the two strings differ only where the corpus
 * has "extension or\n statically" and the rendered page has
 * "extension or\nstatically" - same words, same order, same page.
 */
test("TEST-012 an expected passage matches whatever whitespace the page used", () => {
  const wrapped: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha\\s+beta"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [
          { url: "https://example.test/a", text: "alpha beta compiled\n   into one thing" },
        ],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(wrapped, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://example.test/a",
        text: "alpha beta compiled\ninto one thing",
        token_count: 6,
      },
    ],
  });

  expect(graded.components.extraction).toBe(10);
});

/** Different words are still different, however the whitespace falls. */
test("TEST-012 collapsing whitespace does not make unrelated text match", () => {
  const wrapped: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [{ url: "https://example.test/a", text: "alpha beta gamma" }],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(wrapped, {
    case_id: "technical-bun-webview",
    results: [{ url: "https://example.test/a", text: "alpha beta delta", token_count: 3 }],
  });

  expect(graded.components.extraction).toBe(0);
});

/**
 * A capture that ends on a link keeps the space the markup put around it, so
 * the corpus holds "compiling loadable extensions ." where the page reads
 * "compiling loadable extensions." - a space the browser never shows and the
 * reader never sees. Measured on SQLite's FTS5 page, this single character was
 * the whole difference between the expected passage and the returned one.
 */
test("TEST-012 a space the markup left before punctuation is not a difference", () => {
  const spaced: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [
          {
            url: "https://example.test/a",
            text: "as described in compiling extensions . there are two",
          },
        ],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(spaced, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://example.test/a",
        text: "alpha: as described in compiling extensions. there are two entry points",
        token_count: 12,
      },
    ],
  });

  expect(graded.components.extraction).toBe(10);
});

/**
 * A pattern quoting an identifier in backticks - `cannot be combined with
 * \`path\` or \`argv\`` - is quoting the page's Markdown source, not its rendered
 * text. A browser renders that as code styling and drops the characters, so a
 * product returning the very sentence fails on punctuation the reader never
 * sees.
 *
 * Measured on bun.com/docs/runtime/webview, the product returns "cannot be
 * combined with path or argv" and the corpus pattern requires the backticks.
 * Two of that case's four claims fail this way, costing evidence coverage on a
 * page the product renders and ranks first.
 */
test("TEST-012 a pattern's backticks are markup, not text the page shows", () => {
  const quoted: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["cannot be combined with `path` or `argv`"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(quoted, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://example.test/a",
        text: "alpha: url cannot be combined with path or argv.",
        token_count: 9,
      },
    ],
  });

  expect(graded.components.evidenceCoverage).toBe(35);
});

/** A pattern that names different words still does not match. */
test("TEST-012 ignoring backticks does not make unrelated text match", () => {
  const quoted: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["cannot be combined with `path`"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(quoted, {
    case_id: "technical-bun-webview",
    results: [
      { url: "https://example.test/a", text: "alpha: url works with argv.", token_count: 6 },
    ],
  });

  expect(graded.components.evidenceCoverage).toBe(0);
});

/**
 * A page is the same page under a host the corpus already treats as a mirror.
 *
 * `sourceRecall` and `rank` compare URLs through `pageIdentity`, which folds
 * `bun.sh` into `bun.com` - the two serve byte-identical documents, and the
 * sealed corpus cites the older name. `extraction` compared them as strings.
 *
 * So on `technical-bun-webview` the same run scored 25 of 25 for finding the
 * page and 0 of 10 for extracting from it, on one page returned once. Measured
 * live, the expected passage is carried whole by the first of the two passages
 * that page contributes; only the spelling of its host differed.
 *
 * This aligns `extraction` with the identity the rest of the grader already
 * uses. It is not a loosened comparison: the passage text must still be
 * present in full.
 */
test("TEST-012 extraction reads a mirrored host as the page the corpus cites", () => {
  const mirrored: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://bun.sh/docs/runtime/webview", equivalent_urls: [] }],
        evidence_passages: [
          { url: "https://bun.sh/docs/runtime/webview", text: "alpha connects over a socket" },
        ],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(mirrored, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://bun.com/docs/runtime/webview",
        text: "alpha connects over a socket instead of spawning",
        token_count: 12,
      },
    ],
  });

  expect(graded.components.extraction).toBe(10);
});

/** A genuinely different page is still a different page. */
test("TEST-012 extraction does not accept another page carrying the same words", () => {
  const elsewhere: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://bun.sh/docs/runtime/webview", equivalent_urls: [] }],
        evidence_passages: [
          { url: "https://bun.sh/docs/runtime/webview", text: "alpha connects over a socket" },
        ],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(elsewhere, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://example.test/copy",
        text: "alpha connects over a socket instead of spawning",
        token_count: 12,
      },
    ],
  });

  expect(graded.components.extraction).toBe(0);
});
