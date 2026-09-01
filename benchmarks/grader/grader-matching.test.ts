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
 * A pattern is matched against the same reading of a page that `extraction`
 * compares against.
 *
 * `flattened` exists because a browser collapses the whitespace a source file
 * wrapped a sentence in, and drops the space markup leaves around an inline
 * link. `evidenceCoverage` tested its patterns against `normalized` text,
 * which does neither, so one grader read a page two ways: a passage could be
 * credited as extracted and the same wording refused as evidence.
 *
 * Measured live on `bun.com/docs/runtime/webview`, the pattern
 * `cannot be combined with \`path\` or \`argv\`` fails against the returned
 * text and matches once the same text is read the way `extraction` reads it.
 */
test("TEST-012 a pattern is read against the same page text extraction compares", () => {
  const wrapped: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["cannot be combined with path"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(wrapped, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://example.test/a",
        // A line break inside the sentence, as a source file wraps it.
        text: "alpha: url cannot be combined with\n    path or argv.",
        token_count: 12,
      },
    ],
  });

  expect(graded.components.evidenceCoverage).toBe(35);
});

/** Collapsing whitespace does not make unrelated wording match. */
test("TEST-012 reading whitespace loosely does not join separate sentences", () => {
  const separate: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["cannot be combined with path"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(separate, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://example.test/a",
        text: "alpha: url cannot be combined. with a different path entirely.",
        token_count: 12,
      },
    ],
  });

  expect(graded.components.evidenceCoverage).toBe(0);
});

/**
 * A quotation mark holds its content the way a bracket does.
 *
 * The capture step already drops the space markup leaves inside `(` and `[`.
 * A quoted span is the same construction: the WHATWG URL Standard writes
 * `is "." or an ASCII case-insensitive match for "%2e"`, and the corpus
 * captured it as `is ". " or an ASCII case-insensitive match for " %2e "` -
 * the spaces the markup put around an inline `<code>`, which a browser never
 * renders and a reader never sees.
 *
 * Measured live, that is the entire difference between the corpus's passage
 * and the page: the returned group carries the sentence, word for word, and
 * diverges first at character 60 of 251 on exactly this space.
 */
test("TEST-012 a space the markup left inside quotes is not a difference", () => {
  const quoted: TeacherFixture = {
    case_id: "technical-url-canonicalization",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [
          {
            url: "https://example.test/a",
            text: 'a segment that is ". " or a match for " %2e "',
          },
        ],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(quoted, {
    case_id: "technical-url-canonicalization",
    results: [
      {
        url: "https://example.test/a",
        text: 'alpha: a segment that is "." or a match for "%2e" and more',
        token_count: 12,
      },
    ],
  });

  expect(graded.components.extraction).toBe(10);
});

/** Dropping those spaces does not make different quoted content match. */
test("TEST-012 ignoring quote spacing does not equate different quoted text", () => {
  const different: TeacherFixture = {
    case_id: "technical-url-canonicalization",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://example.test/a", equivalent_urls: [] }],
        evidence_passages: [
          { url: "https://example.test/a", text: 'a segment that is ". " or a match for " %2f "' },
        ],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(different, {
    case_id: "technical-url-canonicalization",
    results: [
      {
        url: "https://example.test/a",
        text: 'alpha: a segment that is "." or a match for "%2e" and more',
        token_count: 12,
      },
    ],
  });

  expect(graded.components.extraction).toBe(0);
});
