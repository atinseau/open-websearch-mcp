/** A bounded source-located portion of external untrusted content. */
export interface EvidencePassage {
  readonly text: string;
  readonly sourceUrl: URL;
  readonly trust: "external_untrusted";
}

/** Produces evidence passages from a rendered document. */
export interface Extractor {
  extract(input: ExtractionInput): Promise<readonly EvidencePassage[]>;
}

export interface ExtractionInput {
  readonly documentUrl: URL;
  readonly renderedText: string;
}
