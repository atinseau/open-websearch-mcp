import type { CaseScore } from "./grader.ts";
export type Promotion = { promoted: boolean; failures: string[] };
export function assessPromotion(
  champion: readonly CaseScore[],
  challenger: readonly CaseScore[],
  categories: ReadonlyMap<string, string>,
  criticalCanaries: ReadonlySet<string>,
): Promotion {
  const numeric = (scores: readonly CaseScore[]) =>
    scores
      .map((score) => score.total)
      .filter((total): total is number => typeof total === "number");
  const challengerScores = numeric(challenger);
  const championScores = numeric(champion);
  const failures: string[] = [];
  if (challengerScores.length !== challenger.length || championScores.length !== champion.length)
    failures.push("unmeasurable component prevents promotion");
  const mean =
    challengerScores.reduce((sum, score) => sum + score, 0) / Math.max(1, challengerScores.length);
  if (mean < 75) failures.push("mean below 75");
  if (
    challengerScores.filter((score) => score >= 70).length / Math.max(1, challengerScores.length) <
    0.8
  )
    failures.push("fewer than 80% of queries score 70+");
  if (
    challenger.some(
      (score) =>
        criticalCanaries.has(score.case_id) && typeof score.total === "number" && score.total < 50,
    )
  )
    failures.push("critical canary below 50");
  const championMean =
    championScores.reduce((sum, score) => sum + score, 0) / Math.max(1, championScores.length);
  if (mean - championMean < 3) failures.push("overall gain below 3");
  for (const category of new Set(categories.values())) {
    const categoryMean = (scores: readonly CaseScore[]) => {
      const values = scores
        .filter((score) => categories.get(score.case_id) === category)
        .map((score) => score.total)
        .filter((value): value is number => typeof value === "number");
      return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    };
    if (categoryMean(challenger) - categoryMean(champion) < -5)
      failures.push(`category ${category} lost more than 5`);
  }
  return { promoted: failures.length === 0, failures };
}
