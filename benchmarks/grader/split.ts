export const calibrationCaseIds = [
  "technical-bun-webview",
  "technical-mcp-stdio",
  "technical-pdfjs",
  "technical-robots-rfc",
  "technical-sqlite-fts5",
  "technical-url-canonicalization",
  "current-bun-release",
  "current-mcp-release",
  "academic-bm25",
  "academic-browser-fingerprinting",
  "academic-retrieval-diversity",
  "community-bun-production",
  "community-headless-stealth",
  "community-robots-ethics",
] as const;
export const validationCaseIds = [
  "multilingual-es-climate",
  "multilingual-fr-open-data",
  "multilingual-ja-web-standards",
  "ambiguous-best-search",
  "ambiguous-xanadu-tuesday",
  "current-apple-security",
] as const;
const calibration = new Set<string>(calibrationCaseIds);
const validation = new Set<string>(validationCaseIds);
export function assertCalibrationOnly(caseIds: readonly string[]): void {
  const invalid = caseIds.filter((id) => validation.has(id) || !calibration.has(id));
  if (invalid.length)
    throw new Error(`weight optimization is calibration-only; refused: ${invalid.join(", ")}`);
}
export function assertCompleteSplit(caseIds: readonly string[]): void {
  if (
    caseIds.length !== 20 ||
    new Set(caseIds).size !== 20 ||
    caseIds.some((id) => !calibration.has(id) && !validation.has(id))
  )
    throw new Error("teacher corpus must use the locked 14/6 split");
}
