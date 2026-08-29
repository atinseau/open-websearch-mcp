const credential =
  /(?:Bearer\s+|(?:password|token|secret|api[_-]?key|access[_-]?key|auth)\s*[=:]\s*)[^\s,;]+/gi;
const cookie = /(?:cookie|set-cookie)[^\n]*/gi;

/** Removes values that must never enter public diagnostics or traces. */
export function redactDiagnostic(value: string): string {
  return value.replace(cookie, "[redacted-cookie]").replace(credential, "[redacted-secret]");
}

/** Rejects archive entries that could escape an installation staging directory. */
export function safeArchiveEntry(entry: string): boolean {
  return !entry.startsWith("/") && !entry.startsWith("\\") && !/(^|[\\/])\.\.([\\/]|$)/.test(entry);
}
