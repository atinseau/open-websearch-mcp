/**
 * Grades a dated teacher corpus.
 *
 *   bun benchmarks/grader/run.ts <YYYY-MM-DD> [output] [--product-search]
 *
 * Without `--product-search` the runner feeds the grader source URLs carrying
 * empty text. That probe checks URL, equivalence and rank mechanics offline and
 * measures no answer quality; its report says so. With the flag the runner
 * drives the product's own `web_search` tool and grades what came back.
 */
import { assertCompleteSplit } from "./split.ts";
import { claimSourceUrls, corpusDateValue, loadCases, loadFixture } from "./corpus-io.ts";
import { buildReport, type ScoringMode } from "./report.ts";
import { closeProduct, searchWithProduct } from "./product-run.ts";
import type { CaseResult, TeacherFixture } from "./grader.ts";

const positional = Bun.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const productSearch = Bun.argv.includes("--product-search");
const corpusDate = corpusDateValue(positional[0]);
const output = positional[1] ?? "benchmarks/grader/report.json";
const mode: ScoringMode = productSearch ? "product-search" : "offline-source-only-mechanics-probe";

const cases = await loadCases();
assertCompleteSplit(cases.map((entry) => entry.id));
const fixtures: TeacherFixture[] = [];
const results: CaseResult[] = [];
for (const entry of cases) {
  const fixture = await loadFixture(corpusDate, entry.id);
  fixtures.push(fixture);
  results.push(
    productSearch
      ? await searchWithProduct(entry.id, entry.question ?? entry.id)
      : probeResult(fixture),
  );
}

await closeProduct();
const report = buildReport({ mode, corpusDate, cases, fixtures, results });
await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));

function probeResult(fixture: TeacherFixture): CaseResult {
  return {
    case_id: fixture.case_id,
    results: claimSourceUrls(fixture).map((url) => ({ url, text: "", token_count: 0 })),
  };
}
