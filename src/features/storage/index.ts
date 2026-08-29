import type { InvestigationId } from "@/features/investigation";

export {
  createStorage,
  type Storage,
  type StorageBlobs,
  type StorageDatabase,
} from "./application/storage.ts";
export { openStorage, type StorageOptions } from "./adapters/open-storage.ts";
export { BlobStore } from "./adapters/blob-store.ts";
export { SqliteStore } from "./adapters/sqlite-store.ts";
export type {
  AdvancedLocalSearchCapability,
  BlobReference,
  StorageDiagnostic,
} from "./domain/types.ts";

/** Persists investigation identity and consumed-page reservations. */
export interface InvestigationRepository {
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
