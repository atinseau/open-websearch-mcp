/** Stable identity for one isolated persistent search journey. */
export type InvestigationId = string;

/** Persistent context that scopes returned pages to one investigation. */
export interface Investigation {
  readonly id: InvestigationId;
}

/** The result of attempting to consume a fully prepared page. */
export type ConsumptionResult<T> =
  | { readonly state: "consumed"; readonly investigation: Investigation; readonly response: T }
  | { readonly state: "already_consumed"; readonly investigation: Investigation }
  | { readonly state: "cancelled"; readonly investigation: Investigation };
