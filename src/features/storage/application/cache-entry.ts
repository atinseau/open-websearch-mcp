import { nearDuplicateSignature } from "../domain/near-duplicate.ts";
import type { CachedDocument } from "../domain/types.ts";

export function cacheEntryValues(document: CachedDocument, expiresAt: Date | undefined): unknown[] {
  return [
    document.url.href,
    document.body.digest,
    document.body.path,
    document.fetchedAt.toISOString(),
    dateValue(expiresAt),
    headerValue(document, "etag"),
    headerValue(document, "last-modified"),
    headersValue(document),
    document.body.digest,
    null,
    document.contentClass,
    document.bodyKind,
    document.body.byteLength,
    document.fetchedAt.toISOString(),
    document.pinned ? 1 : 0,
    document.mainContent ?? null,
    JSON.stringify(nearDuplicateSignature(document.mainContent ?? "") ?? []),
  ];
}

function dateValue(value: Date | undefined): string | null {
  return value?.toISOString() ?? null;
}

function headerValue(document: CachedDocument, name: string): string | null {
  return document.headers?.get(name) ?? null;
}

function headersValue(document: CachedDocument): string {
  return JSON.stringify([...(document.headers ?? new Headers())]);
}
