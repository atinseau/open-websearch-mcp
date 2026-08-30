import { expect, test } from "bun:test";

import { gradeCase, type TeacherFixture } from "./grader.ts";

test("a fragment names a place inside a page, not a different page", () => {
  // The corpus cites url.spec.whatwg.org/#url-parsing; a product that returned
  // that page scored zero because the strings differ, although the fragment is
  // never sent to the server and the retrieved resource is identical.
  const anchored: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha\\s+beta"],
        sources: [{ url: "https://spec.test/page#section-two", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(anchored, {
    case_id: "technical-bun-webview",
    results: [{ url: "https://spec.test/page", text: "alpha beta", token_count: 2 }],
  });

  expect(graded.components.sourceRecall).toBe(25);
});

test("a trailing slash and a host case difference name the same page", () => {
  const cased: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha\\s+beta"],
        sources: [{ url: "https://Spec.Test/page/", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(cased, {
    case_id: "technical-bun-webview",
    results: [{ url: "https://spec.test/page", text: "alpha beta", token_count: 2 }],
  });

  expect(graded.components.sourceRecall).toBe(25);
});

test("a different path is still a different page", () => {
  const other: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha\\s+beta"],
        sources: [{ url: "https://spec.test/page", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(other, {
    case_id: "technical-bun-webview",
    results: [{ url: "https://spec.test/elsewhere", text: "alpha beta", token_count: 2 }],
  });

  expect(graded.components.sourceRecall).toBe(0);
});
test("a site that moved domain is the same page when both names serve it", () => {
  // The corpus cites bun.sh/docs/runtime/webview; the engines now return
  // bun.com/docs/runtime/webview. Both names serve byte-identical responses
  // (307,391 characters, verified), so scoring zero would measure a rename
  // rather than the product's recall.
  const moved: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://bun.sh/docs/runtime/webview", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(moved, {
    case_id: "technical-bun-webview",
    results: [{ url: "https://bun.com/docs/runtime/webview", text: "alpha", token_count: 2 }],
  });

  expect(graded.components.sourceRecall).toBe(25);
});

test("an unrelated host is still an unrelated page", () => {
  const moved: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://bun.sh/docs/runtime/webview", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(moved, {
    case_id: "technical-bun-webview",
    results: [{ url: "https://example.com/docs/runtime/webview", text: "alpha", token_count: 2 }],
  });

  expect(graded.components.sourceRecall).toBe(0);
});

test("the same host with a different path is still a different page", () => {
  const moved: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["alpha"],
        acceptable_patterns: ["alpha"],
        sources: [{ url: "https://bun.sh/docs/runtime/webview", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(moved, {
    case_id: "technical-bun-webview",
    results: [{ url: "https://bun.com/docs/runtime/sqlite", text: "alpha", token_count: 2 }],
  });

  expect(graded.components.sourceRecall).toBe(0);
});
