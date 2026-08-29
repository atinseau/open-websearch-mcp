import type { InvestigationId } from "@/features/investigation";

export {
  createStorage,
  type Storage,
  type StorageBlobs,
  type StorageDatabase,
  type StorageCache,
  type CacheReadOptions,
} from "./application/storage.ts";
export { openStorage, type StorageOptions } from "./adapters/open-storage.ts";
export { BlobIntegrityError, BlobLimitError, BlobStore } from "./adapters/blob-store.ts";
export { SqliteStore } from "./adapters/sqlite-store.ts";
export {
  createDownloadBudget,
  downloadDocument,
  DownloadLimitError,
  DOWNLOAD_LIMIT_BYTES,
  type DownloadBudget,
  type DownloadInput,
  type DownloadedDocument,
  type DownloadTransport,
} from "./application/download.ts";
export { DEFAULT_CACHE_LIMIT_BYTES } from "./application/cache.ts";
export type {
  AdvancedLocalSearchCapability,
  BlobReference,
  CachedDocument,
  CachedDocumentResult,
  CacheBodyKind,
  CacheContentClass,
  CacheTtls,
  StorageDiagnostic,
} from "./domain/types.ts";

/** Persists investigation identity and consumed-page reservations. */
export interface InvestigationRepository {
  ensureInvestigation(investigationId: InvestigationId): Promise<void>;
  reserveConsumedPage(input: ConsumedPageReservation): Promise<ConsumedPageReservationResult>;
}

export interface ConsumedPageReservation {
  readonly investigationId: InvestigationId;
  readonly url: URL;
  readonly signal: AbortSignal;
}

export interface ConsumedPageReservationResult {
  readonly reserved: boolean;
}
