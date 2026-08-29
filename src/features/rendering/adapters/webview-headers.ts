import type { RenderRequest } from "@/features/rendering";

/** Reads one CDP response header, whatever case the origin used. */
export function headerValue(headers: Record<string, unknown>, name: string): unknown {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

/**
 * Keeps the response headers that decide cache freshness. Without them the
 * cache can only fall back to content-class TTLs, so an origin's own expiry and
 * validators are ignored and a conditional revalidation is impossible.
 */
export function cacheDirectives(headers: Record<string, unknown>): Record<string, string> {
  const wanted = ["cache-control", "etag", "last-modified", "expires", "date"];
  const kept: Record<string, string> = {};
  for (const name of wanted) {
    const value = headerValue(headers, name);
    if (typeof value === "string") kept[name] = value;
  }
  return kept;
}

/**
 * Turns a stored copy's validators into conditional request headers. Returns
 * undefined when there is nothing to ask about, so no header is set at all.
 */
export function conditionalHeaders(
  conditional: RenderRequest["conditional"],
): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (conditional?.etag) headers["If-None-Match"] = conditional.etag;
  if (conditional?.lastModified) headers["If-Modified-Since"] = conditional.lastModified;
  return Object.keys(headers).length > 0 ? headers : undefined;
}
