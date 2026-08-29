import {
  hasEmbeddedCredential,
  isSafeSensitiveMetadataKey,
  isSensitiveKey,
} from "./contract-json.ts";
import { jsonl } from "./audit-artifacts.ts";

const legacyMachineData = /\/Users\/|\/(?:private\/)?var\/folders\/|\/tmp\//;

type LegacySanitizationContext = {
  label: string;
  key?: string;
  sensitiveContainer: boolean;
  sensitiveKey: boolean;
};

export function assertLegacySanitized(
  value: unknown,
  label: string,
  key?: string,
  sensitiveContainer = false,
  sensitiveKey = false,
): void {
  const context = { label, key, sensitiveContainer, sensitiveKey };
  assertLegacyScalar(value, context);
  if (typeof value === "string") return;
  if (Array.isArray(value)) return assertLegacyArray(value, context);
  if (typeof value === "object" && value !== null) assertLegacyObject(value, context);
}

function assertLegacyScalar(value: unknown, context: LegacySanitizationContext): void {
  if (requiresRedaction(value, context)) {
    throw new Error(`${context.label}.${context.key} contains unsanitized legacy identity data`);
  }
  if (containsSensitiveScalar(value, context)) {
    throw new Error(
      `${context.label}.${context.key} contains data inside a sensitive legacy object`,
    );
  }
  if (
    typeof value === "string" &&
    (legacyMachineData.test(value) || hasEmbeddedCredential(value))
  ) {
    throw new Error(`${context.label} contains unsanitized legacy data`);
  }
}

function requiresRedaction(value: unknown, context: LegacySanitizationContext): boolean {
  return context.sensitiveKey && isScalar(value) && value !== "[REDACTED]";
}

function containsSensitiveScalar(value: unknown, context: LegacySanitizationContext): boolean {
  return (
    context.sensitiveContainer &&
    context.key !== undefined &&
    !isSafeSensitiveMetadataKey(context.key) &&
    isScalar(value) &&
    value !== "[REDACTED]"
  );
}

function isScalar(value: unknown): boolean {
  return typeof value !== "object" || value === null || Array.isArray(value);
}

function assertLegacyArray(values: unknown[], context: LegacySanitizationContext): void {
  values.forEach((item, index) =>
    assertLegacySanitized(
      item,
      `${context.label}[${index}]`,
      undefined,
      context.sensitiveContainer,
    ),
  );
}

function assertLegacyObject(value: object, context: LegacySanitizationContext): void {
  for (const [key, entry] of Object.entries(value)) {
    assertLegacySanitized(
      entry,
      context.label,
      key,
      context.sensitiveContainer || context.sensitiveKey,
      isSensitiveKey(key, value),
    );
  }
}

export async function assertLegacyArtifactSanitized(root: string, path: string): Promise<void> {
  const absolutePath = `${root}/${path}`;
  if (path.endsWith(".json"))
    return assertLegacySanitized(await Bun.file(absolutePath).json(), path);
  if (path.endsWith(".jsonl")) return assertLegacySanitized(await jsonl(absolutePath), path);
  if (path.endsWith(".md")) return assertLegacySanitized(await Bun.file(absolutePath).text(), path);
  throw new Error(`unsupported teacher artifact type: ${path}`);
}
