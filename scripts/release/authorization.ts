/** Reads the versioned `release-authorization` artifact RELEASE-006 requires. */
import type { Authorization } from "./publish-ledger.ts";

const schemaVersion = 1;

export function parseAuthorization(text: string): Authorization {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("release-authorization is not an object");
  if (value.schema_version !== schemaVersion)
    throw new Error(
      `unsupported release-authorization schema version: ${String(value.schema_version)}`,
    );
  return {
    commit: required(value, "commit"),
    version: required(value, "version"),
    package: required(value, "package"),
    distTag: required(value, "dist_tag"),
    approvedBy: required(value, "approved_by"),
    tarballSha256: required(value, "tarball_sha256"),
  };
}

function required(value: Record<string, unknown>, field: string): string {
  const entry = value[field];
  if (typeof entry !== "string" || entry.trim() === "")
    throw new Error(`release-authorization is missing ${field}`);
  return entry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
