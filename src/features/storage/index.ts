import type { InvestigationId } from "@/features/investigation";

export { openStorage, type Storage, type StorageOptions } from "./application/storage.ts";
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
