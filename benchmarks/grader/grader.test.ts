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
