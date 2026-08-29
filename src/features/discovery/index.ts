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
