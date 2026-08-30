/** A public destination that may provide evidence but is not yet accepted. */
export interface Candidate {
  readonly url: URL;
  readonly sourceType: CandidateSourceType;
  readonly title?: string;
}

export type CandidateSourceType =
  | "organic"
  | "news"
  | "discussion"
  | "video"
  | "academic"
  | "document"
  | "other"
  | "local_cache";

/** Acquires candidates from a Google front-end page or the local cache. */
export interface DiscoveryService {
  discover(input: DiscoveryInput): Promise<readonly Candidate[]>;
}

export interface DiscoveryInput {
  readonly query: string;
}

import type { InvestigationId } from "@/features/investigation";
import type { RenderedDocument, Renderer } from "@/features/rendering";

export interface GoogleProfile {
  readonly id: "google-public";
  readonly persistent: true;
  readonly importsUserCredentials: false;
}

export interface GoogleDiscoveryInput extends DiscoveryInput {
  readonly investigationId: InvestigationId;
  readonly signal: AbortSignal;
  readonly locale?: string;
}

export interface GoogleDiscoveryResult {
  readonly status: "success" | "empty" | "blocked" | "parse_failure" | "error";
  readonly reason?: string;
  /** Which engine produced this result, so provenance survives the chain. */
  readonly engine?: string;
  readonly candidates: readonly Candidate[];
  readonly suggestedQueries: readonly SuggestedQuery[];
}

export interface GoogleDiscoveryService {
  profile(): GoogleProfile;
  discover(input: GoogleDiscoveryInput): Promise<GoogleDiscoveryResult>;
}

export interface SuggestedQuery {
  readonly query: string;
  readonly source: "google_related" | "google_question";
}

export {
  analyzeCandidates,
  type CandidateAttempt,
  type CandidateAttemptResult,
} from "./application/candidate-attempts";
export { ChainedDiscovery, type NamedEngine } from "./application/chained-discovery";
export { createDiscovery, type ChainedDiscoveryService } from "./application/discovery-factory";
export { EngineDiscovery } from "./application/engine-discovery";
export { engineNames, type EngineName } from "./domain/engine-names";
export {
  GoogleDiscovery,
  googleSearchUrl,
  type GoogleDiscoveryOptions,
} from "./application/google-discovery";
export type { RenderedDocument, Renderer };
