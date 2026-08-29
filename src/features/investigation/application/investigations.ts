import type { InvestigationRepository } from "@/features/storage";

import type { ConsumptionResult, Investigation, InvestigationId } from "../domain/investigation.ts";

export interface InvestigationService {
  resolve(investigationId?: InvestigationId): Promise<Investigation>;
  explore<T>(input: PageExploration<T>): Promise<ExplorationResult<T>>;
  consumePreparedPage<T>(input: PreparedPageConsumption<T>): Promise<ConsumptionResult<T>>;
}

export interface PageExploration<T> {
  readonly investigationId?: InvestigationId;
  readonly signal: AbortSignal;
  /** Retrieves or evaluates a candidate without making it unavailable. */
  readonly explore: () => Promise<T>;
}

export interface ExplorationResult<T> {
  readonly investigation: Investigation;
  readonly response?: T;
  readonly state: "explored" | "cancelled";
}

export interface PreparedPageConsumption<T> {
  readonly investigationId?: InvestigationId;
  readonly url: URL;
  readonly signal: AbortSignal;
  /** Produces the complete exploitable response without consuming its page. */
  readonly prepareForEmission: () => Promise<T>;
}

export function createInvestigationService(
  repository: InvestigationRepository,
): InvestigationService {
  return new PersistentInvestigationService(repository);
}

class PersistentInvestigationService implements InvestigationService {
  constructor(private readonly repository: InvestigationRepository) {}

  async resolve(investigationId?: InvestigationId): Promise<Investigation> {
    const investigation = { id: investigationId ?? crypto.randomUUID() };
    await this.repository.ensureInvestigation(investigation.id);
    return investigation;
  }

  async explore<T>(input: PageExploration<T>): Promise<ExplorationResult<T>> {
    const investigation = await this.resolve(input.investigationId);
    if (input.signal.aborted) return { state: "cancelled", investigation };
    const response = await input.explore();
    return input.signal.aborted
      ? { state: "cancelled", investigation }
      : { state: "explored", investigation, response };
  }

  async consumePreparedPage<T>(input: PreparedPageConsumption<T>): Promise<ConsumptionResult<T>> {
    const investigation = await this.resolve(input.investigationId);
    if (input.signal.aborted) return { state: "cancelled", investigation };

    const response = await input.prepareForEmission();
    if (input.signal.aborted) return { state: "cancelled", investigation };

    const reservation = await this.repository.reserveConsumedPage({
      investigationId: investigation.id,
      url: input.url,
      signal: input.signal,
    });
    if (reservation.reserved) return { state: "consumed", investigation, response };
    return input.signal.aborted
      ? { state: "cancelled", investigation }
      : { state: "already_consumed", investigation };
  }
}
