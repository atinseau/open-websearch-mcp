import { createStorage, type Storage, type StorageDatabase } from "../application/storage.ts";
import { BlobStore } from "./blob-store.ts";
import { SqliteStore, type Fts5Database } from "./sqlite-store.ts";

export interface StorageOptions {
  readonly workspace: string;
  readonly beforeMigration?: (version: number) => void;
  readonly fts5Database?: Fts5Database;
}

/** Adapter factory retained for tests; production composes these dependencies in bootstrap. */
export async function openStorage(options: StorageOptions): Promise<Storage> {
  await Promise.all([
    Bun.write(`${options.workspace}/.storage-ready`, ""),
    Bun.write(`${options.workspace}/cache/blobs/.storage-ready`, ""),
  ]);
  const sqlite: StorageDatabase = new SqliteStore({
    path: `${options.workspace}/state.sqlite`,
    beforeMigration: options.beforeMigration,
    fts5Database: options.fts5Database,
  });
  return createStorage(sqlite, new BlobStore(`${options.workspace}/cache/blobs`));
}
