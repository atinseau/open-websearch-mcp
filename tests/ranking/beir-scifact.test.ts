import { expect, test } from "bun:test";
import { evaluateSciFact } from "../../benchmarks/ranking/beir-scifact";

test("TEST-018 evaluates the deterministic lexical ranker against vendored public SciFact qrels", async () => {
  const first = await evaluateSciFact();
  const second = await evaluateSciFact();
  expect(second).toEqual(first);
  expect(first).toMatchObject({
    dataset: "BEIR SciFact test",
    offline: true,
    qrels: 12,
    queries: 11,
    documents: 10,
  });
  expect(first.mrrAt10).toBeGreaterThan(0);
  expect(first.recallAt10).toBeGreaterThan(0);
});
