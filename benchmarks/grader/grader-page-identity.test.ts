import { expect, test } from "bun:test";
import { gradeCase, type TeacherFixture } from "./grader.ts";

/**
 * Which page a result is, as the grader decides it. Kept apart from the tests
 * of how a page's text is read: this file asks whether two URLs name the same
 * document, not whether two spellings of a sentence say the same thing.
 */

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
