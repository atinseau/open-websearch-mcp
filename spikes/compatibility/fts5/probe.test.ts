import { expect, test } from "bun:test";

import { detectAdvancedLocalSearch, type Fts5Database } from "./probe.ts";

test("FTS5 absence degrades only advanced local search without an installer", () => {
  const unavailable: Fts5Database = {
    prepare() {
      return {
        get() {
          throw new Error("FTS5 unavailable");
        },
        run() {
          throw new Error("FTS5 unavailable");
        },
      };
    },
  };

  expect(detectAdvancedLocalSearch(unavailable)).toEqual({
    advancedLocalSearch: "degraded",
    automaticHomebrewInstall: false,
    diagnostic: "sqlite_fts5_unavailable",
  });
});
