import type {
  ConsumedPageReservation,
  ConsumedPageReservationResult,
  InvestigationRepository,
} from "../index.ts";
import { BlobStore } from "../adapters/blob-store.ts";
import { SqliteStore, type Fts5Database } from "../adapters/sqlite-store.ts";
import type {
  AdvancedLocalSearchCapability,
  BlobReference,
  StorageDiagnostic,
} from "../domain/types.ts";

export interface StorageOptions {
  readonly workspace: string;
  readonly beforeMigration?: (version: number) => void;
  readonly fts5Database?: Fts5Database;
}

export interface Storage extends InvestigationRepository {
  readonly advancedLocalSearch: AdvancedLocalSearchCapability;
  readonly diagnostics: readonly StorageDiagnostic[];
  readonly blobs: {
    put(body: Uint8Array | string): Promise<BlobReference>;
    get(reference: BlobReference): Promise<Uint8Array>;
  };
  close(): void;
  journalMode(): string;
  migrationVersions(): readonly number[];
}

export async function openStorage(options: StorageOptions): Promise<Storage> {
  await ensureWorkspace(options.workspace);
  const sqlite = new SqliteStore({
    path: `${options.workspace}/state.sqlite`,
    beforeMigration: options.beforeMigration,
    fts5Database: options.fts5Database,
  });
  return new WorkspaceStorage(sqlite, new BlobStore(`${options.workspace}/cache/blobs`));
}

class WorkspaceStorage implements Storage {
  readonly diagnostics: readonly StorageDiagnostic[];
  readonly advancedLocalSearch;
  readonly blobs: Storage["blobs"];

  constructor(
    private readonly sqlite: SqliteStore,
    private readonly blobStore: BlobStore,
  ) {
    this.advancedLocalSearch = sqlite.advancedLocalSearch;
    this.diagnostics = diagnosticFor(this.advancedLocalSearch);
    this.blobs = {
      put: (body) => this.putBlob(body),
      get: (reference) => this.blobStore.get(reference),
    };
  }

  async reserveConsumedPage(
    input: ConsumedPageReservation,
  ): Promise<ConsumedPageReservationResult> {
    if (input.signal.aborted) return { reserved: false };
    const now = new Date().toISOString();
    const database = this.sqlite.database;
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          "INSERT OR IGNORE INTO investigations (id, created_at, updated_at) VALUES (?, ?, ?)",
        )
        .run(input.investigationId, now, now);
      const result = database
        .prepare(
          "INSERT OR IGNORE INTO consumed_pages (investigation_id, canonical_url, consumed_at) VALUES (?, ?, ?)",
        )
        .run(input.investigationId, input.url.href, now) as { changes: number };
      database.exec("COMMIT");
      return { reserved: result.changes === 1 };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async ensureInvestigation(investigationId: string): Promise<void> {
    const now = new Date().toISOString();
    this.sqlite.database
      .prepare("INSERT OR IGNORE INTO investigations (id, created_at, updated_at) VALUES (?, ?, ?)")
      .run(investigationId, now, now);
  }

  close(): void {
    this.sqlite.close();
  }

  journalMode(): string {
    return String(
      column(this.sqlite.database.prepare("PRAGMA journal_mode").get(), "journal_mode"),
    );
  }

  migrationVersions(): readonly number[] {
    return this.sqlite.database
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => Number(column(row, "version")));
  }

  private async putBlob(body: Uint8Array | string): Promise<BlobReference> {
    const reference = await this.blobStore.put(body);
    this.sqlite.database
      .prepare(
        "INSERT OR IGNORE INTO cache_blobs (digest, path, byte_length, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(reference.digest, reference.path, reference.byteLength, new Date().toISOString());
    return reference;
  }
}

async function ensureWorkspace(workspace: string): Promise<void> {
  await Promise.all([
    Bun.write(`${workspace}/.storage-ready`, ""),
    Bun.write(`${workspace}/cache/blobs/.storage-ready`, ""),
  ]);
}

function diagnosticFor(capability: AdvancedLocalSearchCapability): readonly StorageDiagnostic[] {
  return capability.diagnostic === undefined
    ? []
    : [
        {
          code: capability.diagnostic,
          message: "SQLite FTS5 is unavailable; advanced local search is disabled.",
        },
      ];
}

function column(row: unknown, name: string): unknown {
  if (typeof row !== "object" || row === null || !(name in row)) {
    throw new Error(`Expected SQLite column ${name}`);
  }
  return Object.entries(row).find(([key]) => key === name)?.[1];
}
