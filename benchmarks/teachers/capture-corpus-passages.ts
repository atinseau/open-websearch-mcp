import { captureCorpusPassages, type SealedFixture } from "./capture-passages.ts";
import { requiredDate } from "./contract-json.ts";
import { withRefreshMutation } from "./refresh-lifecycle.ts";
import { teacherCases } from "./contract.ts";

/**
 * Produces a dated corpus whose accepted claims carry source-located evidence
 * passages, leaving the sealed source corpus untouched.
 *
 * Pages are retrieved over plain HTTP with no JavaScript and no renderer. That
 * is the whole point: the product cannot supply the ground truth it is scored
 * against. Pages needing JavaScript simply yield no passage and are named in
 * the report rather than approximated.
 */

const root = import.meta.dir;

/** Strips markup without executing anything, so a page becomes comparable text. */
function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/(?:p|div|section|article|li|tr|h[1-6]|pre|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n[ \n]*\n */g, "\n\n")
    .trim();
}

async function retrieve(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
    headers: { "user-agent": "OpenWebSearchMCP-corpus-capture" },
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return pageText(await response.text());
}

async function readFixtures(sourceDate: string): Promise<readonly SealedFixture[]> {
  const corpus = await Bun.file(`${root}/corpus.json`).json();
  const cases = teacherCases(corpus);
  const fixtures: SealedFixture[] = [];
  for (const teacherCase of cases) {
    const path = `${root}/fixtures/${sourceDate}/cases/${teacherCase.id}/fixture.json`;
    fixtures.push(await Bun.file(path).json());
  }
  return fixtures;
}

async function writeCorpus(date: string, fixtures: readonly SealedFixture[]): Promise<void> {
  for (const fixture of fixtures) {
    const directory = `${root}/fixtures/${date}/cases/${fixture.case_id}`;
    await Bun.$`mkdir -p ${directory}`.quiet();
    await Bun.write(`${directory}/fixture.json`, `${JSON.stringify(fixture, undefined, 2)}\n`);
  }
}

if (import.meta.main) {
  const sourceDate = Bun.argv[2];
  const targetDate = Bun.argv[3];
  if (!sourceDate || !targetDate) {
    throw new Error("usage: bun capture-corpus-passages.ts <source-date> <target-date>");
  }
  requiredDate(sourceDate, "source corpus date");
  requiredDate(targetDate, "target corpus date");

  const fixtures = await readFixtures(sourceDate);
  const captured = await captureCorpusPassages(fixtures, retrieve);

  await withRefreshMutation(root, targetDate, async () => {
    await writeCorpus(targetDate, captured.fixtures);
    await Bun.write(
      `${root}/fixtures/${targetDate}/capture-report.json`,
      `${JSON.stringify(captured.report, undefined, 2)}\n`,
    );
  });

  console.log(
    JSON.stringify({
      source: sourceDate,
      target: targetDate,
      total_claims: captured.report.total_claims,
      captured: captured.report.captured.length,
      excluded: captured.report.excluded.length,
    }),
  );
}
