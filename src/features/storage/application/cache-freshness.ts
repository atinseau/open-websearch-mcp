import type { CachedDocument, CacheTtls } from "../domain/types.ts";

/** Reads one column from a SQLite row, failing loudly on a shape change. */
export function column(row: unknown, name: string): unknown {
  if (typeof row !== "object" || row === null || !(name in row))
    throw new Error(`Expected SQLite column ${name}`);
  return Object.entries(row).find(([key]) => key === name)?.[1];
}

/**
 * When a stored entry stops being reusable without revalidation. `no-cache`
 * expires immediately; `no-store` is handled before the write, since it forbids
 * storing the response at all.
 */
export function expiration(document: CachedDocument): Date | undefined {
  const control = document.headers?.get("cache-control") ?? "";
  if (/no-cache/iu.test(control)) return document.fetchedAt;
  const match = /max-age=(\\d+)/iu.exec(control);
  return match === null
    ? undefined
    : new Date(document.fetchedAt.getTime() + Number(match[1]) * 1000);
}

/** `no-store` forbids writing the response down, not merely reusing it. */
export function noStore(document: CachedDocument): boolean {
  return /no-store/iu.test(document.headers?.get("cache-control") ?? "");
}

/** A row is fresh until its explicit expiry, or its content class TTL. */
export function isFresh(row: unknown, now: Date, ttls: CacheTtls): boolean {
  const explicit = column(row, "expires_at");
  const expiry = typeof explicit === "string" ? new Date(explicit) : classExpiry(row, ttls);
  return expiry.getTime() > now.getTime();
}

function classExpiry(row: unknown, ttls: CacheTtls): Date {
  const fetchedAt = new Date(String(column(row, "fetched_at")));
  const kind = String(column(row, "content_class"));
  return new Date(fetchedAt.getTime() + ttlFor(kind, ttls) * 1000);
}

function ttlFor(kind: string, ttls: CacheTtls): number {
  if (kind === "news") return ttls.newsTtlSeconds;
  if (kind === "docs") return ttls.docsTtlSeconds;
  if (kind === "versioned") return ttls.versionedTtlSeconds;
  return ttls.generalTtlSeconds;
}
