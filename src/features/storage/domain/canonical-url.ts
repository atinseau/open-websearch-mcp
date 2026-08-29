import { sanitizeOutboundUrl } from "@/features/security";

/** Produces the stable, public cache key for a URL accepted by security policy. */
export function canonicalizeUrl(value: URL): URL {
  const url = sanitizeOutboundUrl(value);
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  url.pathname = normalizedPath(url.pathname);
  if (url.pathname.length > 1 && url.pathname.endsWith("/"))
    url.pathname = url.pathname.slice(0, -1);
  return url;
}

function normalizedPath(path: string): string {
  return path.replace(/%[0-9a-f]{2}/giu, normalizeEscape);
}

function normalizeEscape(escape: string): string {
  const value = Number.parseInt(escape.slice(1), 16);
  const character = String.fromCharCode(value);
  return isUnreserved(character) ? character : `%${escape.slice(1).toUpperCase()}`;
}

function isUnreserved(value: string): boolean {
  return /^[A-Za-z0-9\-._~]$/u.test(value);
}
