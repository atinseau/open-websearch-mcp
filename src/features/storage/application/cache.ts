import type { CachedDocument, CachedDocumentResult, CacheTtls } from "../domain/types.ts";
import type { StorageDatabaseConnection } from "./storage.ts";

export interface StorageCache {
  put(document: CachedDocument): Promise<void>;
  get(url: URL, options: CacheReadOptions): Promise<CachedDocumentResult | undefined>;
  evict(maximumBytes?: number): Promise<void>;
}

export const DEFAULT_CACHE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

export interface CacheReadOptions {
  readonly now: Date;
  readonly ttls: CacheTtls;
  readonly forceRevalidate?: boolean;
}

export class SqliteCache implements StorageCache {
  constructor(private readonly database: StorageDatabaseConnection) {}

  async put(document: CachedDocument): Promise<void> {
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
          last_accessed_at, pinned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...entryValues(document, expiresAt));
  }

  async get(url: URL, options: CacheReadOptions): Promise<CachedDocumentResult | undefined> {
    const row = this.database
      .prepare("SELECT * FROM cache_entries WHERE canonical_url = ?")
      .get(url.href);
    if (row === null) return undefined;
    const fresh = !options.forceRevalidate && isFresh(row, options.now, options.ttls);
    this.database
      .prepare("UPDATE cache_entries SET last_accessed_at = ? WHERE canonical_url = ?")
      .run(options.now.toISOString(), url.href);
    return { provenance: "local_cache", document: readDocument(row), fresh, revalidate: !fresh };
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
      this.database
        .prepare("DELETE FROM cache_entries WHERE canonical_url = ?")
        .run(column(row, "canonical_url"));
      total -= Number(column(row, "byte_length"));
      await removeUnreferencedBlob(this.database, row);
    }
  }
}

function entryValues(document: CachedDocument, expiresAt: Date | undefined): unknown[] {
  return [
    document.url.href,
    document.body.digest,
    document.body.path,
    document.fetchedAt.toISOString(),
    expiresAt?.toISOString() ?? null,
    document.headers?.get("etag") ?? null,
    document.headers?.get("last-modified") ?? null,
    JSON.stringify([...(document.headers ?? new Headers())]),
    document.body.digest,
    null,
    document.contentClass,
    document.bodyKind,
    document.body.byteLength,
    document.fetchedAt.toISOString(),
    document.pinned ? 1 : 0,
  ];
}

function expiration(document: CachedDocument): Date | undefined {
  const control = document.headers?.get("cache-control") ?? "";
  if (/no-store|no-cache/iu.test(control)) return document.fetchedAt;
  const match = /max-age=(\d+)/iu.exec(control);
  return match === null
    ? undefined
    : new Date(document.fetchedAt.getTime() + Number(match[1]) * 1000);
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
