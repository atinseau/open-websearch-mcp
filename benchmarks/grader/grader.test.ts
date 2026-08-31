import { expect, test } from "bun:test";
import { assessPromotion } from "./promotion.ts";
import { gradeCase, type CaseResult, type TeacherFixture } from "./grader.ts";
import { assertCalibrationOnly, calibrationCaseIds, validationCaseIds } from "./split.ts";

const fixture: TeacherFixture = {
  case_id: "technical-bun-webview",
  claims: [
    {
      id: "claim",
      required_concepts: ["alpha"],
      acceptable_patterns: ["alpha\\s+beta"],
      sources: [{ url: "https://example.test/a", equivalent_urls: ["https://mirror.test/a"] }],
      evidence_passages: [{ url: "https://example.test/a", text: "alpha beta" }],
      weight: 1,
    },
  ],
};
const result: CaseResult = {
  case_id: "technical-bun-webview",
  results: [{ url: "https://example.test/a", text: "alpha beta", token_count: 2 }],
};

test("TEST-012 deterministic lexical grader is repeatable", () => {
  expect(JSON.stringify(gradeCase(fixture, result))).toBe(
    JSON.stringify(gradeCase(fixture, result)),
  );
  expect(gradeCase(fixture, result).total).toBe(100);
});
test("TEST-014 locks the 14/6 split and refuses validation optimization", () => {
  expect(calibrationCaseIds).toHaveLength(14);
  expect(validationCaseIds).toHaveLength(6);
  expect(() => assertCalibrationOnly(validationCaseIds)).toThrow("calibration-only");
  expect(() => assertCalibrationOnly(calibrationCaseIds)).not.toThrow();
});
test("TEST-016 classifies all threshold bands and absent passage truth", () => {
  expect(
    gradeCase({ ...fixture, claims: [{ ...fixture.claims[0]!, evidence_passages: [] }] }, result)
      .classification,
  ).toBe("unmeasurable");
});
test("TEST-017 refuses promotion where totals are unmeasurable", () => {
  const score = gradeCase(
    { ...fixture, claims: [{ ...fixture.claims[0]!, evidence_passages: [] }] },
    result,
  );
  expect(
    assessPromotion(
      [score],
      [score],
      new Map([[score.case_id, "technical_docs"]]),
      new Set([score.case_id]),
    ).promoted,
  ).toBeFalse();
});

test("grades the named dated teacher corpus", async () => {
  const repository = new URL("../../", import.meta.url).pathname;
  const datedOutput = `${Bun.env.TMPDIR ?? "/private/tmp"}/grader-${crypto.randomUUID()}.json`;
  try {
    const outcome = await run(
      ["bun", "benchmarks/grader/run.ts", "2026-08-27", datedOutput],
      repository,
    );

    expect(outcome.exitCode, outcome.output).toBe(0);
    expect(JSON.parse(outcome.output).corpus.accepted_claims).toBe(100);
  } finally {
    if (await Bun.file(datedOutput).exists()) await Bun.file(datedOutput).delete();
  }
});

test("requires a teacher corpus date in YYYY-MM-DD format", async () => {
  const repository = new URL("../../", import.meta.url).pathname;

  const missing = await run(["bun", "benchmarks/grader/run.ts"], repository);
  expect(missing.exitCode).not.toBe(0);
  expect(missing.output).toContain("expected teacher corpus date as YYYY-MM-DD");

  const malformed = await run(["bun", "benchmarks/grader/run.ts", "2026-08-2x"], repository);
  expect(malformed.exitCode).not.toBe(0);
  expect(malformed.output).toContain("expected teacher corpus date as YYYY-MM-DD");
});

async function run(
  command: string[],
  cwd: string,
): Promise<{ readonly exitCode: number; readonly output: string }> {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, output: `${stdout}${stderr}` };
}

test("an identifier-styled concept is recognised in the prose that expresses it", () => {
  // The corpus labels concepts like "external-content"; no page writes that
  // hyphenated form. The capture step already grounds such a label through
  // conceptGrounded, so grading it literally applied a stricter rule than the
  // one used to accept the claim in the first place.
  const identifiers: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["external-content", "rowid-lookup"],
        acceptable_patterns: ["content="],
        sources: [{ url: "https://spec.test/page", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(identifiers, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://spec.test/page",
        text: "An external content table stores rows elsewhere. The rowid lookup uses content= to find them.",
        token_count: 20,
      },
    ],
  });

  expect(graded.components.evidenceCoverage).toBe(35);
});

test("a concept absent from the page is still absent", () => {
  const identifiers: TeacherFixture = {
    case_id: "technical-bun-webview",
    claims: [
      {
        id: "claim",
        required_concepts: ["external-content", "vacuum-policy"],
        acceptable_patterns: ["content="],
        sources: [{ url: "https://spec.test/page", equivalent_urls: [] }],
        evidence_passages: [],
        weight: 1,
      },
    ],
  };

  const graded = gradeCase(identifiers, {
    case_id: "technical-bun-webview",
    results: [
      {
        url: "https://spec.test/page",
        text: "An external content table uses content= to find rows.",
        token_count: 20,
      },
    ],
  });

  expect(graded.components.evidenceCoverage).toBe(0);
});

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
