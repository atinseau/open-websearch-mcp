/** A stable, content-addressed reference to a cache body. */
export interface BlobReference {
  readonly digest: string;
  readonly byteLength: number;
  readonly path: string;
}

/** Availability of the optional SQLite FTS5-backed local search index. */
export interface AdvancedLocalSearchCapability {
  readonly advancedLocalSearch: "enabled" | "degraded";
  readonly automaticHomebrewInstall: false;
  readonly diagnostic?: "sqlite_fts5_unavailable";
}

/** An observable non-fatal storage condition. */
export interface StorageDiagnostic {
  readonly code: "sqlite_fts5_unavailable";
  readonly message: string;
}

export type CacheContentClass = "news" | "general" | "docs" | "versioned";
export type CacheBodyKind = "binary" | "rendered" | "text";

/** Configuration-owned defaults used when HTTP freshness metadata is absent. */
export interface CacheTtls {
  readonly newsTtlSeconds: number;
  readonly generalTtlSeconds: number;
  readonly docsTtlSeconds: number;
  readonly versionedTtlSeconds: number;
}

export interface CachedDocument {
  readonly url: URL;
  readonly body: BlobReference;
  readonly contentClass: CacheContentClass;
  readonly bodyKind: CacheBodyKind;
  readonly fetchedAt: Date;
  readonly headers?: Headers;
  readonly pinned?: boolean;
  /** Extracted main content. Only this bounded text participates in FTS and deduplication. */
  readonly mainContent?: string;
}

export interface CachedDocumentResult {
  readonly provenance: "local_cache";
  readonly document: CachedDocument;
  readonly fresh: boolean;
  readonly revalidate: boolean;
}

export interface CachedLocalSearchResult {
  readonly provenance: "local_cache";
  readonly document: CachedDocument;
}

export interface LocalSearchResult {
  readonly results: readonly CachedLocalSearchResult[];
  readonly diagnostic?: "sqlite_fts5_unavailable";
}
