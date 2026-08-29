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
