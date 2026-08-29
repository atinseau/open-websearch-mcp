export type JsonRecord = Record<string, unknown>;

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
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} must not be empty`);
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
