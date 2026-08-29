import { Database } from "bun:sqlite";

import type { AdvancedLocalSearchCapability } from "../domain/types.ts";

export interface SqliteStoreOptions {
  readonly path: string;
  readonly beforeMigration?: (version: number) => void;
  readonly fts5Database?: Fts5Database;
}

export interface Fts5Database {
  prepare(sql: string): { get(...values: unknown[]): unknown; run(...values: unknown[]): unknown };
}

export class SqliteStore {
  readonly database: Database;
  readonly advancedLocalSearch: AdvancedLocalSearchCapability;

  constructor(options: SqliteStoreOptions) {
    this.database = new Database(options.path, { create: true, strict: true });
    try {
      this.database.exec(
        "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
      );
      applyMigrations(this.database, options.beforeMigration);
      this.advancedLocalSearch = detectFts5(options.fts5Database ?? this.database);
      if (this.advancedLocalSearch.advancedLocalSearch === "enabled") {
        this.database.exec(
          "CREATE VIRTUAL TABLE IF NOT EXISTS cache_search USING fts5(canonical_url, content)",
        );
      }
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

export function detectFts5(database: Fts5Database): AdvancedLocalSearchCapability {
  try {
    if (compileOption(database) !== 1) throw new Error("SQLite was built without FTS5");
    const table = `storage_fts_probe_${crypto.randomUUID().replaceAll("-", "")}`;
    database.prepare(`CREATE VIRTUAL TABLE ${table} USING fts5(content)`).run();
    database.prepare(`DROP TABLE ${table}`).run();
    return { advancedLocalSearch: "enabled", automaticHomebrewInstall: false };
  } catch {
    return {
      advancedLocalSearch: "degraded",
      automaticHomebrewInstall: false,
      diagnostic: "sqlite_fts5_unavailable",
    };
  }
}

function compileOption(database: Fts5Database): number {
  const row = database.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled").get();
  if (typeof row !== "object" || row === null || !("enabled" in row)) return 0;
  return Number(Object.entries(row).find(([key]) => key === "enabled")?.[1]);
}

function applyMigrations(database: Database, beforeMigration?: (version: number) => void): void {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const migration of migrations) {
    if (isApplied(database, migration.version)) continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      beforeMigration?.(migration.version);
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(migration.version, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function isApplied(database: Database, version: number): boolean {
  return (
    database.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version) !== null
  );
}

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE investigations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE queries (id INTEGER PRIMARY KEY, query TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE candidates (id INTEGER PRIMARY KEY, query_id INTEGER REFERENCES queries(id), original_url TEXT NOT NULL, canonical_url TEXT, final_url TEXT, content_hash TEXT, extractor_version TEXT, created_at TEXT NOT NULL);
      CREATE TABLE candidate_aliases (candidate_id INTEGER NOT NULL REFERENCES candidates(id), alias_url TEXT NOT NULL UNIQUE, PRIMARY KEY(candidate_id, alias_url));
      CREATE TABLE ranking_features (candidate_id INTEGER NOT NULL REFERENCES candidates(id), name TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY(candidate_id, name));
      CREATE TABLE cache_entries (canonical_url TEXT PRIMARY KEY, blob_digest TEXT, blob_path TEXT, fetched_at TEXT NOT NULL, expires_at TEXT, etag TEXT, last_modified TEXT, headers_json TEXT, content_hash TEXT, extractor_version TEXT);
      CREATE TABLE cache_blobs (digest TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, byte_length INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE timings (id INTEGER PRIMARY KEY, candidate_id INTEGER REFERENCES candidates(id), phase TEXT NOT NULL, duration_ms INTEGER NOT NULL, recorded_at TEXT NOT NULL);
      CREATE TABLE consumed_pages (investigation_id TEXT NOT NULL REFERENCES investigations(id), canonical_url TEXT NOT NULL, consumed_at TEXT NOT NULL, PRIMARY KEY(investigation_id, canonical_url));
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE cache_entries ADD COLUMN content_class TEXT NOT NULL DEFAULT 'general';
      ALTER TABLE cache_entries ADD COLUMN body_kind TEXT NOT NULL DEFAULT 'rendered';
      ALTER TABLE cache_entries ADD COLUMN byte_length INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cache_entries ADD COLUMN last_accessed_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE cache_entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX cache_entries_lru ON cache_entries(pinned, body_kind, last_accessed_at);
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE cache_entries ADD COLUMN main_content TEXT;
      ALTER TABLE cache_entries ADD COLUMN duplicate_signature_json TEXT;
      CREATE TABLE cache_aliases (
        alias_url TEXT PRIMARY KEY,
        canonical_url TEXT NOT NULL REFERENCES cache_entries(canonical_url)
      );
      CREATE INDEX cache_aliases_canonical ON cache_aliases(canonical_url);
    `,
  },
] as const;
