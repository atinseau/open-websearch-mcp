const tracker = /^(utm_.+|gclid|dclid|fbclid|igshid|msclkid|ttclid|yclid|mc_[a-z]+)$/i;
const metadataHosts = new Set(["metadata.google.internal", "metadata", "instance-data"]);

export interface PublicUrlAssessment {
  readonly allowed: boolean;
  readonly reason?: string;
}

export function assessPublicUrl(url: URL): PublicUrlAssessment {
  const reason =
    schemeReason(url) ?? credentialReason(url) ?? portReason(url) ?? hostnameReason(url);
  return reason ? { allowed: false, reason } : { allowed: true };
}

export function sanitizeOutboundUrl(url: URL): URL {
  const sanitized = new URL(url);
  for (const key of Array.from(sanitized.searchParams.keys()))
    if (tracker.test(key)) sanitized.searchParams.delete(key);
  sanitized.hash = "";
  return sanitized;
}

export function isForbiddenAddress(address: string): boolean {
  if (address.includes(":")) return forbiddenV6(address);
  return /^\d+(?:\.\d+){3}$/.test(address) && forbiddenV4(address);
}

function schemeReason(url: URL): string | undefined {
  return url.protocol === "http:" || url.protocol === "https:" ? undefined : "non_http_scheme";
}
function credentialReason(url: URL): string | undefined {
  return url.username || url.password ? "embedded_credentials" : undefined;
}
function portReason(url: URL): string | undefined {
  return url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65_535)
    ? "invalid_port"
    : undefined;
}
function hostnameReason(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    metadataHosts.has(host)
    ? "local_hostname"
    : isForbiddenAddress(host)
      ? "non_public_address"
      : undefined;
}
function forbiddenV4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255))
    return true;
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    sharedAddress(first, second) ||
    privateRange(first, second) ||
    documentationRange(first, second)
  );
}
function sharedAddress(first: number, second: number): boolean {
  return first === 100 && second >= 64 && second <= 127;
}
function privateRange(first: number, second: number): boolean {
  return (
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168))
  );
}
function documentationRange(first: number, second: number): boolean {
  return (
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0)
  );
}
function forbiddenV6(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fe80:") ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("ff")
  )
    return true;
  const mapped = value.match(/^(?:0*:){0,6}ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return forbiddenV4(mapped[1]!);
  const mappedHex = value.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  return mappedHex
    ? forbiddenV4(mappedHexToV4(mappedHex[1]!, mappedHex[2]!))
    : !/^[0-9a-f:]+$/.test(value);
}
function mappedHexToV4(left: string, right: string): string {
  const first = Number.parseInt(left, 16);
  const second = Number.parseInt(right, 16);
  return `${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`;
}
