import { Database } from "bun:sqlite";

export interface Fts5Database {
  prepare(query: string): { get(...values: unknown[]): unknown; run(...values: unknown[]): unknown };
}

export type AdvancedLocalSearchCapability = {
  advancedLocalSearch: "enabled" | "degraded";
  automaticHomebrewInstall: false;
  diagnostic?: "sqlite_fts5_unavailable";
};

export function detectAdvancedLocalSearch(database: Fts5Database): AdvancedLocalSearchCapability {
  try {
    database.prepare("CREATE VIRTUAL TABLE compatibility_fts USING fts5(content)").run();
    database.prepare("DROP TABLE compatibility_fts").run();
    return { advancedLocalSearch: "enabled", automaticHomebrewInstall: false };
  } catch {
    return {
      advancedLocalSearch: "degraded",
      automaticHomebrewInstall: false,
      diagnostic: "sqlite_fts5_unavailable",
    };
  }
}

const database = new Database(":memory:");
const compileOption = database
  .prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled")
  .get() as { enabled: number };
const capability = detectAdvancedLocalSearch(database);

console.log(JSON.stringify({ compileOption, capability }));
