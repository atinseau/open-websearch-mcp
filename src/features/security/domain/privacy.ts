// A secret looks like a token, not like prose. Redaction therefore needs both a
// credential-shaped name and a credential-shaped value, so "how does bearer
// token authentication work" stays readable while `token: aGVsbG8x` does not.
// An `=` assignment is always treated as a credential: prose does not assign.
const secretish = String.raw`[^\s,;'"]*(?:[A-Za-z][0-9]|[0-9][A-Za-z]|[-_./+])[^\s,;'"]*`;
const names = String.raw`password|passwd|token|secret|api[_-]?key|access[_-]?key|auth[_-]?token`;
const credential = new RegExp(
  [
    String.raw`Bearer\s+${secretish}`,
    String.raw`(?:${names})\s*=\s*[^\s,;'"]+`,
    String.raw`(?:${names})\s*:\s*${secretish}`,
  ].join("|"),
  "gi",
);
const cookie = /(?:cookie|set-cookie)[^\n]*/gi;

/** Removes values that must never enter public diagnostics or traces. */
export function redactDiagnostic(value: string): string {
  return value.replace(cookie, "[redacted-cookie]").replace(credential, "[redacted-secret]");
}

/** Rejects archive entries that could escape an installation staging directory. */
export function safeArchiveEntry(entry: string): boolean {
  return !entry.startsWith("/") && !entry.startsWith("\\") && !/(^|[\\/])\.\.([\\/]|$)/.test(entry);
}
