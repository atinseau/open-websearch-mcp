export /**
 * Whether a passage is a page's navigation rather than its content.
 *
 * A rendered documentation page opens with its whole menu collapsed into one
 * run, because each label is its own element with no text between them:
 * `Documentation IndexFetch the complete...Skip to main contentModel Context
 * Protocol home pageVersion 2026-07-28`. That run names every section a site
 * has, so it matches more of any question than the section that answers one.
 *
 * Measured on `modelcontextprotocol.io`, it was the first of 58 blocks, 2,462
 * characters, and scored 14 where the block holding "MUST declare the tools
 * capability" scored 5 and ranked tenth - the case scored zero for evidence
 * coverage with that sentence on the page.
 *
 * The glue is the signal: 2.84 lowercase-uppercase joins per 100 characters
 * there against 0.76 in the prose, and only 4 of that page's 58 blocks exceed
 * two. Prose that merely names products or people stays well under it.
 */
function isNavigation(text: string): boolean {
  if (text.length < NAVIGATION_MINIMUM) return false;
  const joins = (text.match(/\p{Ll}\p{Lu}/gu) ?? []).length;
  if (joins / (text.length / 100) >= NAVIGATION_JOINS_PER_100) return true;
  return isContentsList(text);
}

/**
 * A page's table of contents: one short labelled line per section.
 *
 * It is navigation in another shape - listed rather than glued - and it names
 * every subject a page covers, so it matches more of any question than the
 * section that answers one. Measured on SQLite's FTS5 page, its contents list
 * was block 6 of 790, 2,395 characters, and scored highest of all of them,
 * while the block naming `sqlite3_fts5_init` ranked 487th; that case scored
 * zero for evidence coverage with the symbol on the page.
 *
 * Every one of its 76 lines was under 70 characters, where the prose beside it
 * had none. A list of real sentences is longer than that and stays evidence.
 */
function isContentsList(text: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < CONTENTS_MINIMUM_LINES) return false;
  const short = lines.filter((line) => line.trim().length <= CONTENTS_LINE_LENGTH).length;
  return short / lines.length >= CONTENTS_SHORT_RATIO;
}

const CONTENTS_MINIMUM_LINES = 8;
const CONTENTS_LINE_LENGTH = 70;
const CONTENTS_SHORT_RATIO = 0.9;

/**
 * Short runs are not menus, whatever their capitalisation. An oversized block
 * is cut into passage-sized pieces before anything is scored, so the threshold
 * has to admit a piece of a menu, not only a whole one.
 */
const NAVIGATION_MINIMUM = 200;
const NAVIGATION_JOINS_PER_100 = 2;
