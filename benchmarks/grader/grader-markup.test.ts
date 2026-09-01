import { expect, test } from "bun:test";
import { gradeCase, type TeacherFixture } from "./grader.ts";

/**
 * Markup a browser renders as styling rather than as characters. Kept apart
 * from the whitespace tests: those ask how a sentence was wrapped, these ask
 * which characters the reader was ever shown.
 */

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
