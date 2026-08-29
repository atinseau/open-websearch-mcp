import type { InvestigationId } from "@/features/investigation";

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
