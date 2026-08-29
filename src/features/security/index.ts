/** Determines whether a public destination is permitted before navigation. */
export interface PublicUrlPolicy {
  assess(url: URL): PublicUrlAssessment;
}

export interface PublicUrlAssessment {
  readonly allowed: boolean;
  readonly reason?: string;
}
