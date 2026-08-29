import type {
  ConsumedPageReservation,
  ConsumedPageReservationResult,
  InvestigationRepository,
} from "../index.ts";
import type {
  AdvancedLocalSearchCapability,
  BlobReference,
  StorageDiagnostic,
} from "../domain/types.ts";
import { SqliteCache, type StorageCache } from "./cache.ts";
export type { CacheReadOptions, StorageCache } from "./cache.ts";

export interface StorageDatabase {
  readonly advancedLocalSearch: AdvancedLocalSearchCapability;
  readonly database: StorageDatabaseConnection;
  close(): void;
}
export interface StorageDatabaseConnection {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): unknown;
    get(...values: unknown[]): unknown;
    all(): unknown[];
  };
}
export interface StorageBlobs {
  put(body: Uint8Array | string): Promise<BlobReference>;
  get(reference: BlobReference): Promise<Uint8Array>;
  putStream(
    body: ReadableStream<Uint8Array>,
    limit: number,
    observe: (bytes: number) => void,
  ): Promise<BlobReference>;
}

export interface Storage extends InvestigationRepository {
  readonly advancedLocalSearch: AdvancedLocalSearchCapability;
  readonly diagnostics: readonly StorageDiagnostic[];
  readonly blobs: {
    put(body: Uint8Array | string): Promise<BlobReference>;
    get(reference: BlobReference): Promise<Uint8Array>;
    putStream(
      body: ReadableStream<Uint8Array>,
      limit: number,
      observe: (bytes: number) => void,
    ): Promise<BlobReference>;
  };
  readonly cache: StorageCache;
  close(): void;
  journalMode(): string;
  migrationVersions(): readonly number[];
}

export function createStorage(sqlite: StorageDatabase, blobs: StorageBlobs): Storage {
  return new WorkspaceStorage(sqlite, blobs);
}

class WorkspaceStorage implements Storage {
  readonly diagnostics: readonly StorageDiagnostic[];
  readonly advancedLocalSearch;
  readonly blobs: Storage["blobs"];
  readonly cache: StorageCache;

  constructor(
    private readonly sqlite: StorageDatabase,
    private readonly blobStore: StorageBlobs,
  ) {
    this.advancedLocalSearch = sqlite.advancedLocalSearch;
    this.diagnostics = diagnosticFor(this.advancedLocalSearch);
    this.blobs = {
      put: (body) => this.putBlob(body),
      get: (reference) => this.blobStore.get(reference),
      putStream: (body, limit, observe) => this.blobStore.putStream(body, limit, observe),
    };
    this.cache = new SqliteCache(sqlite.database);
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
        .run(input.investigationId, input.url.href, now);
      database.exec("COMMIT");
      return { reserved: changes(result) === 1 };
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

function changes(result: unknown): number {
  if (typeof result !== "object" || result === null || !("changes" in result)) return 0;
  return typeof result.changes === "number" ? result.changes : 0;
}
