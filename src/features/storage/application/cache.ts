import { canonicalizeUrl } from "../domain/canonical-url.ts";
import { findNearDuplicate } from "../domain/near-duplicate.ts";
import type {
  AdvancedLocalSearchCapability,
  CachedDocument,
  CachedDocumentResult,
  CacheTtls,
  LocalSearchResult,
} from "../domain/types.ts";
import type { StorageDatabaseConnection } from "./storage.ts";
import { cacheEntryValues } from "./cache-entry.ts";

export interface StorageCache {
  put(document: CachedDocument, options?: CachePutOptions): Promise<void>;
  get(url: URL, options: CacheReadOptions): Promise<CachedDocumentResult | undefined>;
  search(query: string, limit?: number): Promise<LocalSearchResult>;
  evict(maximumBytes?: number): Promise<void>;
}

export const DEFAULT_CACHE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

export interface CacheReadOptions {
  readonly now: Date;
  readonly ttls: CacheTtls;
  readonly forceRevalidate?: boolean;
}

/** Supplied from `experimental.near_duplicate_threshold` for the active call. */
export interface CachePutOptions {
  readonly nearDuplicateThreshold?: number;
}

export class SqliteCache implements StorageCache {
  constructor(
    private readonly database: StorageDatabaseConnection,
    private readonly capability: AdvancedLocalSearchCapability,
  ) {}

  async put(document: CachedDocument, options: CachePutOptions = {}): Promise<void> {
    const canonicalUrl = canonicalizeUrl(document.url);
    const representative = this.representative(canonicalUrl, document.mainContent, options);
    const stored = { ...document, url: representative };
    const expiresAt = expiration(document);
    this.database
      .prepare(
        "INSERT OR IGNORE INTO cache_blobs (digest, path, byte_length, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        document.body.digest,
        document.body.path,
        document.body.byteLength,
        document.fetchedAt.toISOString(),
      );
    this.database
      .prepare(
        `INSERT OR REPLACE INTO cache_entries
         (canonical_url, blob_digest, blob_path, fetched_at, expires_at, etag, last_modified,
          headers_json, content_hash, extractor_version, content_class, body_kind, byte_length,
          last_accessed_at, pinned, main_content, duplicate_signature_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...cacheEntryValues(stored, expiresAt));
    this.database
      .prepare("INSERT OR REPLACE INTO cache_aliases (alias_url, canonical_url) VALUES (?, ?)")
      .run(canonicalUrl.href, representative.href);
    this.updateFts(stored);
  }

  async get(url: URL, options: CacheReadOptions): Promise<CachedDocumentResult | undefined> {
    const row = this.database
      .prepare(
        "SELECT cache_entries.* FROM cache_entries LEFT JOIN cache_aliases ON cache_aliases.canonical_url = cache_entries.canonical_url WHERE cache_entries.canonical_url = ? OR cache_aliases.alias_url = ?",
      )
      .get(canonicalizeUrl(url).href, canonicalizeUrl(url).href);
    if (row === null) return undefined;
    const fresh = !options.forceRevalidate && isFresh(row, options.now, options.ttls);
    this.database
      .prepare("UPDATE cache_entries SET last_accessed_at = ? WHERE canonical_url = ?")
      .run(options.now.toISOString(), column(row, "canonical_url"));
    return { provenance: "local_cache", document: readDocument(row), fresh, revalidate: !fresh };
  }

  async search(query: string, limit = 10): Promise<LocalSearchResult> {
    if (this.capability.advancedLocalSearch === "degraded")
      return { results: [], diagnostic: "sqlite_fts5_unavailable" };
    const rows = this.database.prepare(searchSql()).all(ftsQuery(query), limit);
    return {
      results: rows.map((row) => ({ provenance: "local_cache", document: readDocument(row) })),
    };
  }

  async evict(maximumBytes = DEFAULT_CACHE_LIMIT_BYTES): Promise<void> {
    let total = Number(
      column(
        this.database
          .prepare("SELECT COALESCE(SUM(byte_length), 0) AS total FROM cache_entries")
          .get(),
        "total",
      ),
    );
    const rows = this.database
      .prepare(
        "SELECT canonical_url, blob_digest, blob_path, byte_length FROM cache_entries WHERE pinned = 0 ORDER BY CASE body_kind WHEN 'binary' THEN 0 WHEN 'rendered' THEN 1 ELSE 2 END, last_accessed_at",
      )
      .all();
    for (const row of rows) {
      if (total <= maximumBytes) break;
      this.removeIndexEntries(String(column(row, "canonical_url")));
      this.database
        .prepare("DELETE FROM cache_entries WHERE canonical_url = ?")
        .run(column(row, "canonical_url"));
      total -= Number(column(row, "byte_length"));
      await removeUnreferencedBlob(this.database, row);
    }
  }

  private representative(
    canonicalUrl: URL,
    content: string | undefined,
    options: CachePutOptions,
  ): URL {
    const existing = this.existingRepresentative(canonicalUrl, content);
    if (existing !== null) return new URL(String(column(existing, "canonical_url")));
    if (content === undefined || options.nearDuplicateThreshold === undefined) return canonicalUrl;
    const match = findNearDuplicate(
      content,
      duplicateCandidates(this.database),
      options.nearDuplicateThreshold,
    );
    return match?.canonicalUrl ?? canonicalUrl;
  }

  private updateFts(document: CachedDocument): void {
    if (this.capability.advancedLocalSearch === "degraded") return;
    this.database
      .prepare("DELETE FROM cache_search WHERE canonical_url = ?")
      .run(document.url.href);
    if (document.mainContent === undefined) return;
    this.database
      .prepare("INSERT INTO cache_search (canonical_url, content) VALUES (?, ?)")
      .run(document.url.href, document.mainContent);
  }

  private removeIndexEntries(canonicalUrl: string): void {
    this.database.prepare("DELETE FROM cache_aliases WHERE canonical_url = ?").run(canonicalUrl);
    if (this.capability.advancedLocalSearch === "enabled")
      this.database.prepare("DELETE FROM cache_search WHERE canonical_url = ?").run(canonicalUrl);
  }

  private existingRepresentative(canonicalUrl: URL, content: string | undefined): unknown {
    const alias = this.database
      .prepare("SELECT canonical_url FROM cache_aliases WHERE alias_url = ?")
      .get(canonicalUrl.href);
    if (alias !== null) return alias;
    if (content === undefined)
      return this.database
        .prepare("SELECT canonical_url FROM cache_entries WHERE canonical_url = ?")
        .get(canonicalUrl.href);
    return this.database
      .prepare(
        "SELECT canonical_url FROM cache_entries WHERE canonical_url = ? OR main_content = ?",
      )
      .get(canonicalUrl.href, content);
  }
}

function expiration(document: CachedDocument): Date | undefined {
  const control = document.headers?.get("cache-control") ?? "";
  if (/no-store|no-cache/iu.test(control)) return document.fetchedAt;
  const match = /max-age=(\d+)/iu.exec(control);
  return match === null
    ? undefined
    : new Date(document.fetchedAt.getTime() + Number(match[1]) * 1000);
}

function duplicateCandidates(
  database: StorageDatabaseConnection,
): readonly { readonly canonicalUrl: URL; readonly signature: readonly number[] }[] {
  return database
    .prepare("SELECT canonical_url, duplicate_signature_json FROM cache_entries")
    .all()
    .flatMap(candidateFromRow);
}

function candidateFromRow(
  row: unknown,
): readonly { readonly canonicalUrl: URL; readonly signature: readonly number[] }[] {
  const signature = signatureFromJson(column(row, "duplicate_signature_json"));
  return signature.length === 0
    ? []
    : [{ canonicalUrl: new URL(String(column(row, "canonical_url"))), signature }];
}

function signatureFromJson(value: unknown): readonly number[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "number")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function ftsQuery(query: string): string {
  return (query.match(/[\p{L}\p{N}]+/gu) ?? []).map((term) => `"${term}"`).join(" AND ");
}

function searchSql(): string {
  return "SELECT cache_entries.* FROM cache_search JOIN cache_entries ON cache_entries.canonical_url = cache_search.canonical_url WHERE cache_search MATCH ? ORDER BY bm25(cache_search), cache_entries.canonical_url LIMIT ?";
}

function isFresh(row: unknown, now: Date, ttls: CacheTtls): boolean {
  const expiry = column(row, "expires_at");
  const until =
    typeof expiry === "string" && expiry !== "" ? new Date(expiry) : classExpiry(row, ttls);
  return until.getTime() > now.getTime();
}

function classExpiry(row: unknown, ttls: CacheTtls): Date {
  const seconds = ttlFor(String(column(row, "content_class")), ttls);
  return new Date(new Date(String(column(row, "fetched_at"))).getTime() + seconds * 1000);
}

function ttlFor(kind: string, ttls: CacheTtls): number {
  if (kind === "news") return ttls.newsTtlSeconds;
  if (kind === "docs") return ttls.docsTtlSeconds;
  if (kind === "versioned") return ttls.versionedTtlSeconds;
  return ttls.generalTtlSeconds;
}

function readDocument(row: unknown): CachedDocument {
  return {
    url: new URL(String(column(row, "canonical_url"))),
    body: {
      digest: String(column(row, "blob_digest")),
      path: String(column(row, "blob_path")),
      byteLength: Number(column(row, "byte_length")),
    },
    contentClass: contentClass(column(row, "content_class")),
    bodyKind: bodyKind(column(row, "body_kind")),
    fetchedAt: new Date(String(column(row, "fetched_at"))),
    headers: new Headers(headers(column(row, "headers_json"))),
    pinned: Number(column(row, "pinned")) === 1,
    mainContent:
      typeof column(row, "main_content") === "string"
        ? String(column(row, "main_content"))
        : undefined,
  };
}

function contentClass(value: unknown): CachedDocument["contentClass"] {
  if (value === "news" || value === "docs" || value === "versioned") return value;
  return "general";
}

function bodyKind(value: unknown): CachedDocument["bodyKind"] {
  if (value === "binary" || value === "text") return value;
  return "rendered";
}

function headers(value: unknown): HeadersInit {
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter(isHeader) : [];
}

function isHeader(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
  );
}

async function removeUnreferencedBlob(
  database: StorageDatabaseConnection,
  row: unknown,
): Promise<void> {
  const digest = column(row, "blob_digest");
  if (database.prepare("SELECT 1 FROM cache_entries WHERE blob_digest = ?").get(digest) !== null)
    return;
  const path = String(column(row, "blob_path"));
  if (await Bun.file(path).exists()) await Bun.file(path).delete();
  database.prepare("DELETE FROM cache_blobs WHERE digest = ?").run(digest);
}

function column(row: unknown, name: string): unknown {
  if (typeof row !== "object" || row === null || !(name in row))
    throw new Error(`Expected SQLite column ${name}`);
  return Object.entries(row).find(([key]) => key === name)?.[1];
}
