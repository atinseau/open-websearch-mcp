export type JsonRecord = Record<string, unknown>;

const sensitiveKeySuffixes = [
  "accountid",
  "apikey",
  "clientsecret",
  "privatekey",
  "requestid",
  "secretaccesskey",
  "secretkey",
  "sessionid",
  "threadid",
  "token",
] as const;
const sensitivePluralSuffixes = [
  "accountids",
  "accesstokens",
  "apikeys",
  "clientsecrets",
  "idtokens",
  "privatekeys",
  "refreshtokens",
  "requestids",
  "secretaccesskeys",
  "secretkeys",
  "sessionids",
] as const;
const sensitiveKeys = new Set([
  "auth",
  "authentication",
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "password",
  "passphrase",
  "proxyauthorization",
  "setcookie",
  "signature",
  "uuid",
]);
const sensitivePluralKeys = new Set([
  "auths",
  "cookies",
  "credentials",
  "passwords",
  "passphrases",
  "tokens",
]);
const tokenTelemetryKeys = new Set([
  "cachecreationinputtokens",
  "cachereadinputtokens",
  "inputtokens",
  "maxoutputtokens",
  "outputtokens",
  "thinkingtokens",
]);
const safeSensitiveMetadataKeys = new Set(["expiresat", "method", "provider", "type"]);
const webUrlPattern = /https?:\/\/[^\s\]}>,'"`。、）]+/g;
const machinePathPattern =
  /file:\/\/\/(?:Applications|Library|System|Users|Volumes|etc|home|opt|private|projects?|tmp|usr|var|workspaces?)\/(?!\.{1,2}(?:[/"'`\s<>(){},;]|\\["'`]|$))[^\s"'`<>(){},;]+|(?<![.:/A-Za-z0-9])\/(?:Applications|Library|System|Users|Volumes|etc|home|opt|private|projects?|tmp|usr|var|workspaces?)\/(?!\.{1,2}(?:[/"'`\s<>(){},;]|\\["'`]|$))[^\s"'`<>(){},;]+|\b[A-Za-z]:\\[^\s"'`<>(){},;]+/g;
const bearerCredentialPattern = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{16,}/gi;
const basicCredentialPattern = /\bBasic\s+([A-Za-z0-9+/]+={0,2})(?=[\s"'`,;]|$)/gi;
const authorizationCredentialPattern =
  /\b((?:Proxy-)?Authorization:\s*(?:Basic|Bearer)\s+)(?!\[REDACTED\])([A-Za-z0-9._~+/=-]{8,})/gi;
const cookieCredentialPattern = /\b((?:Set-)?Cookie:\s*)(?!\[REDACTED\])([^\r\n]+)/gi;
const urlCredentialPattern = /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const oauthCodePattern = /([?&](?:authorization_code|code)=)(?!\[REDACTED\])([^&#\s]*)/gi;
const assignedCredentialPattern =
  /(\b(?<!product[-_])(?!-)(?!product[-_]?token\b)[A-Za-z0-9_-]*(?:access[_-]?token|api[_-]?key|client[_-]?secret|id[_-]?token|password|passphrase|private[_-]?key|refresh[_-]?token|secret[_-]?(?:access[_-]?)?key|token)\b\s*[=:]\s*)(?!\[REDACTED\])([^\s&;,"'`]+)/gi;
const flaggedCredentialPattern =
  /(--[A-Za-z0-9_-]*(?:access[_-]?token|api[_-]?key|client[_-]?secret|password|passphrase|private[_-]?key|refresh[_-]?token|secret[_-]?(?:access[_-]?)?key)\s+)(?!\[REDACTED\])([^\s]+)/gi;
const assignedIdentityPattern =
  /(?<![A-Za-z0-9-])((?:account|request|session|thread)[_-]?id\b\s*[=:]\s*)(?!\[REDACTED\])([^\s&;,"'`]+)/gi;
const environmentCredentialPattern =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|PASSWORD|PASSPHRASE|SECRET|TOKEN)\s*=\s*)(?!\[REDACTED\])([^\s&;,"'`]+)/g;
const awsAccessKeyPattern = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const privateKeyPattern =
  /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/g;
const standaloneCredentialPattern =
  /\b(?:AIza[A-Za-z0-9_-]{30,}|gl(?:dt|pat)-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|x(?:app|ox[a-z])-[A-Za-z0-9-]{10,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

export function isSensitiveKey(key: string, container?: object): boolean {
  const normalized = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "producttoken") return false;
  if (normalized === "uuid" || normalized === "signature") return sensitiveContextKey(normalized, container);
  if (telemetryKey(normalized)) return false;
  return genericSensitiveKey(normalized);
}

function sensitiveContextKey(key: string, container?: object): boolean {
  if (key === "uuid") return container === undefined || "session_id" in container;
  return key === "signature" && (container === undefined || ("type" in container && container.type === "thinking"));
}

function telemetryKey(key: string): boolean {
  return tokenTelemetryKeys.has(key) || key.endsWith("inputtokens") || key.endsWith("outputtokens") || key === "estimatedtokens";
}

function genericSensitiveKey(key: string): boolean {
  return sensitiveKeys.has(key) || sensitivePluralKeys.has(key) || sensitiveKeySuffixes.some((suffix) => key.endsWith(suffix)) || sensitivePluralSuffixes.some((suffix) => key.endsWith(suffix)) || key.endsWith("tokens");
}

export function isSafeSensitiveMetadataKey(key: string): boolean {
  return safeSensitiveMetadataKeys.has(key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase());
}

export function extractedWebUrls(value: string): string[] {
  return [...value.matchAll(webUrlPattern)]
    .map((match) => trimUrlDelimiters(match[0], value.slice(0, match.index)))
    .filter((candidate) => {
      try {
        const parsed = new URL(candidate);
        return (
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          parsed.hostname.length > 0 &&
          !parsed.hostname.includes("…")
        );
      } catch {
        return false;
      }
    });
}

function trimUrlDelimiters(value: string, prefix: string): string {
  let candidate = cutAtUnmatchedClose(value, "(", ")");
  for (const marker of ["**", "~~", "*", "_"]) {
    if (prefix.endsWith(marker) && candidate.endsWith(marker)) {
      candidate = candidate.slice(0, -marker.length);
      break;
    }
  }
  let previous: string;
  do {
    previous = candidate;
    candidate = candidate.replace(/[.;:!?,]+$/g, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ] as const) {
      while (candidate.endsWith(close) && count(candidate, close) > count(candidate, open)) {
        candidate = candidate.slice(0, -1);
      }
    }
  } while (candidate !== previous);
  return candidate;
}

function cutAtUnmatchedClose(value: string, open: string, close: string): string {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === open) depth += 1;
    if (value[index] !== close) continue;
    if (depth === 0) return value.slice(0, index);
    depth -= 1;
  }
  return value;
}

function count(value: string, character: string): number {
  return value.split(character).length - 1;
}

export function webUrl(value: unknown, label: string): string {
  const candidate = requiredString(value, label);
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.hostname.length === 0 ||
      parsed.hostname.includes("…")
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL`);
  }
  return candidate;
}

export function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) result[key] = entry;
  return result;
}

export function exactRecord(value: unknown, label: string, keys: readonly string[]): JsonRecord {
  const result = record(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(result)) {
    if (!expected.has(key)) throw new Error(`${label} contains unexpected property: ${key}`);
  }
  for (const key of expected) {
    if (!(key in result)) throw new Error(`${label} is missing property: ${key}`);
  }
  return result;
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return value;
}

export function array(value: unknown, label: string, allowEmpty = false): unknown[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must ${allowEmpty ? "be an array" : "not be empty"}`);
  }
  return value;
}

export function requiredDate(value: unknown, label: string, includeTime = false): string {
  const candidate = requiredString(value, label);
  const pattern = includeTime
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
    : /^\d{4}-\d{2}-\d{2}$/;
  const parsed = Date.parse(candidate);
  const roundTrip = Number.isNaN(parsed)
    ? ""
    : new Date(parsed).toISOString().slice(0, includeTime ? 19 : 10);
  if (!pattern.test(candidate) || roundTrip !== candidate.slice(0, includeTime ? 19 : 10)) {
    throw new Error(`${label} must be a valid ${includeTime ? "date-time" : "date"}`);
  }
  return candidate;
}

function sanitizeString(value: string, absolutePaths: readonly string[]): string {
  let sanitized = sanitizeCredentials(value.replaceAll(machinePathPattern, "[REDACTED_PATH]"));
  for (const path of absolutePaths) {
    if (path.length > 0) sanitized = sanitized.replaceAll(path, "[REDACTED_PATH]");
  }
  return sanitized;
}

function sanitizeCredentials(value: string): string {
  const sanitized = value
    .replaceAll(authorizationCredentialPattern, "$1[REDACTED]")
    .replaceAll(cookieCredentialPattern, "$1[REDACTED]")
    .replaceAll(bearerCredentialPattern, "$1 [REDACTED]")
    .replaceAll(urlCredentialPattern, "$1[REDACTED]@")
    .replaceAll(assignedCredentialPattern, "$1[REDACTED]")
    .replaceAll(flaggedCredentialPattern, "$1[REDACTED]")
    .replaceAll(assignedIdentityPattern, "$1[REDACTED]")
    .replaceAll(environmentCredentialPattern, "$1[REDACTED]")
    .replaceAll(awsAccessKeyPattern, "[REDACTED]")
    .replaceAll(privateKeyPattern, "[REDACTED]")
    .replaceAll(standaloneCredentialPattern, "[REDACTED]");
  return redactOAuthCodes(redactBasicCredentials(sanitized));
}

function redactBasicCredentials(value: string): string {
  return value.replaceAll(basicCredentialPattern, (candidate, encoded: string) => {
    try {
      const decoded = atob(encoded);
      return /^[\x20-\x7e]*$/.test(decoded) && /^[^:]+:.*$/.test(decoded)
        ? "Basic [REDACTED]"
        : candidate;
    } catch {
      return candidate;
    }
  });
}

function redactOAuthCodes(value: string): string {
  return value.replaceAll(webUrlPattern, (candidate) => {
    try {
      const url = new URL(candidate);
      const callback =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        /(?:callback|oauth|signin|login)/i.test(url.pathname);
      return callback ? candidate.replaceAll(oauthCodePattern, "$1[REDACTED]") : candidate;
    } catch {
      return candidate;
    }
  });
}

function sanitize(
  value: unknown,
  absolutePaths: readonly string[],
  key?: string,
  sensitiveContainer = false,
  sensitiveKey = false,
): unknown {
  if (redactedScalar(value, key, sensitiveContainer, sensitiveKey)) return "[REDACTED]";
  if (typeof value === "string") return sanitizeString(value, absolutePaths);
  if (Array.isArray(value)) return sanitizeArray(value, absolutePaths, sensitiveContainer);
  if (typeof value !== "object" || value === null) return value;
  return sanitizeRecord(value, absolutePaths, sensitiveContainer, sensitiveKey);
}

function sanitizeArray(value: unknown[], absolutePaths: readonly string[], sensitiveContainer: boolean): unknown[] {
  return value.map((item) => sanitize(item, absolutePaths, undefined, sensitiveContainer, false));
}

function sanitizeRecord(
  value: object,
  absolutePaths: readonly string[],
  sensitiveContainer: boolean,
  sensitiveKey: boolean,
): JsonRecord {
  const result: JsonRecord = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    let sanitizedKey = sanitizeString(entryKey, absolutePaths);
    while (Object.hasOwn(result, sanitizedKey)) sanitizedKey += "[REDACTED_DUPLICATE]";
    result[sanitizedKey] = sanitize(
      entryValue,
      absolutePaths,
      entryKey,
      sensitiveContainer || sensitiveKey,
      isSensitiveKey(entryKey, value),
    );
  }
  return result;
}

function redactedScalar(value: unknown, key: string | undefined, sensitiveContainer: boolean, sensitiveKey: boolean): boolean {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return false;
  return sensitiveKey || (sensitiveContainer && key !== undefined && !isSafeSensitiveMetadataKey(key));
}

export function hasUnsanitizedString(value: string): boolean {
  return sanitizeString(value, []) !== value;
}

export function hasStandaloneCredential(value: string): boolean {
  standaloneCredentialPattern.lastIndex = 0;
  const found = standaloneCredentialPattern.test(value);
  standaloneCredentialPattern.lastIndex = 0;
  return found;
}

export function hasEmbeddedCredential(value: string): boolean {
  return sanitizeCredentials(value) !== value;
}

export function sanitizeJson(value: unknown, absolutePaths: readonly string[]): unknown {
  return sanitize(value, absolutePaths);
}

export function sanitizeJsonl(raw: string, absolutePaths: readonly string[]): string {
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.stringify(sanitize(JSON.parse(line), absolutePaths));
      } catch (error) {
        throw new Error(`invalid JSONL at line ${index + 1}`, { cause: error });
      }
    })
    .join("\n");
}
