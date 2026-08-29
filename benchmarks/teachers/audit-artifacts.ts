import {
  hasUnsanitizedString,
  isSafeSensitiveMetadataKey,
  isSensitiveKey,
  record,
  requiredDate,
  requiredString,
  type JsonRecord,
} from "./contract-json.ts";

export type RefreshTrigger = "initial" | "major-change" | "major-prerelease" | "monthly";
export type RefreshMetadata = {
  schema_version: 1;
  date: string;
  trigger: RefreshTrigger;
  reason?: string;
  immutable: true;
};
export type Manifest = {
  schema_version: 1;
  refresh: Omit<RefreshMetadata, "schema_version"> & {
    teachers: {
      provider: "codex" | "claude";
      model: string;
      cli_version: string;
    }[];
  };
  artifacts: { path: string; sha256: string; bytes: number }[];
};

const refreshTriggers = new Set<RefreshTrigger>([
  "initial",
  "major-change",
  "major-prerelease",
  "monthly",
]);

function isRefreshTrigger(value: string): value is RefreshTrigger {
  return (
    value === "initial" ||
    value === "major-change" ||
    value === "major-prerelease" ||
    value === "monthly"
  );
}

export function assertSanitized(
  value: unknown,
  label: string,
  key?: string,
  sensitiveContainer = false,
  sensitiveKey = false,
): void {
  assertRedactedScalar(value, label, key, sensitiveContainer, sensitiveKey);
  if (typeof value === "string") return assertSanitizedString(value, label);
  if (Array.isArray(value)) {
    assertSanitizedArray(value, label, sensitiveContainer);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  assertSanitizedObject(value, label, sensitiveContainer, sensitiveKey);
}

function assertRedactedScalar(value: unknown, label: string, key: string | undefined, sensitiveContainer: boolean, sensitiveKey: boolean): void {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return;
  if (value === "[REDACTED]") return;
  if (sensitiveKey) throw new Error(`${label}.${key} contains unsanitized identity or credential data`);
  if (sensitiveContainer && key !== undefined && !isSafeSensitiveMetadataKey(key)) throw new Error(`${label}.${key} contains data inside a sensitive object`);
}

function assertSanitizedString(value: string, label: string): void {
  if (hasUnsanitizedString(value)) throw new Error(`${label} contains unsanitized data`);
}

function assertSanitizedArray(value: unknown[], label: string, sensitiveContainer: boolean): void {
  value.forEach((item, index) => assertSanitized(item, `${label}[${index}]`, undefined, sensitiveContainer));
}

function assertSanitizedObject(value: object, label: string, sensitiveContainer: boolean, sensitiveKey: boolean): void {
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (hasUnsanitizedString(entryKey)) throw new Error(`${label} contains an unsanitized key`);
    assertSanitized(
      entryValue,
      label,
      entryKey,
      sensitiveContainer || sensitiveKey,
      isSensitiveKey(entryKey, value),
    );
  }
}

export async function jsonl(path: string): Promise<unknown[]> {
  const lines = (await Bun.file(path).text()).split("\n").filter(Boolean);
  if (lines.length === 0) throw new Error(`${path} must not be empty`);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${index + 1} is invalid JSON`, { cause: error });
    }
  });
}

async function artifactPaths(root: string, date: string): Promise<string[]> {
  const paths: string[] = [];
  for (const prefix of [`runs/${date}`, `fixtures/${date}`]) {
    for await (const path of new Bun.Glob("**/*").scan({
      cwd: `${root}/${prefix}`,
      onlyFiles: true,
    })) {
      const relative = `${prefix}/${path}`;
      if (relative !== `runs/${date}/manifest.json`) paths.push(relative);
    }
  }
  return paths.sort();
}

export async function assertArtifactSanitized(root: string, path: string): Promise<void> {
  const absolutePath = `${root}/${path}`;
  if (path.endsWith(".json")) {
    assertSanitized(await Bun.file(absolutePath).json(), path);
    return;
  }
  if (path.endsWith(".jsonl")) {
    assertSanitized(await jsonl(absolutePath), path);
    return;
  }
  if (path.endsWith(".md")) {
    assertSanitized(await Bun.file(absolutePath).text(), path);
    return;
  }
  throw new Error(`unsupported teacher artifact type: ${path}`);
}

export async function readRefreshMetadata(root: string, date: string): Promise<RefreshMetadata> {
  requiredDate(date, "refresh date");
  const manifestPath = `${root}/runs/${date}/manifest.json`;
  let source: unknown;
  if (await Bun.file(manifestPath).exists()) {
    const manifest = record(await Bun.file(manifestPath).json(), "teacher manifest");
    source = {
      schema_version: manifest.schema_version,
      ...record(manifest.refresh, "manifest refresh"),
    };
  } else {
    source = await Bun.file(`${root}/runs/${date}/refresh.json`).json();
  }
  const value = record(source, "refresh metadata");
  if (value.schema_version !== 1 || value.immutable !== true || value.date !== date) {
    throw new Error("refresh metadata must be versioned, immutable, and match its dated directory");
  }
  const trigger = requiredString(value.trigger, "refresh trigger");
  if (!isRefreshTrigger(trigger) || !refreshTriggers.has(trigger)) {
    throw new Error(`unsupported refresh trigger: ${trigger}`);
  }
  const metadata: RefreshMetadata = {
    schema_version: 1,
    date,
    trigger,
    ...(value.reason === undefined
      ? {}
      : { reason: requiredString(value.reason, "refresh reason") }),
    immutable: true,
  };
  await assertRefreshCadence(root, metadata);
  return metadata;
}

async function assertRefreshCadence(root: string, metadata: RefreshMetadata): Promise<void> {
  const datedMetadata = await storedRefreshMetadata(root);
  const priorDates = priorRefreshDates(datedMetadata, metadata.date);
  assertInitialRefresh(metadata, datedMetadata, priorDates);
  assertMonthlyCadence(metadata, priorDates);
}

async function storedRefreshMetadata(root: string): Promise<Map<string, JsonRecord>> {
  const datedMetadata = new Map<string, JsonRecord>();
  for (const name of ["manifest.json", "refresh.json"] as const) {
    for await (const path of new Bun.Glob(`*/${name}`).scan({
      cwd: `${root}/runs`,
      onlyFiles: true,
    })) {
      const candidate = path.split("/")[0];
      if (candidate === undefined || datedMetadata.has(candidate)) continue;
      const document = record(await Bun.file(`${root}/runs/${path}`).json(), "stored refresh");
      datedMetadata.set(
        candidate,
        name === "manifest.json" ? record(document.refresh, "manifest refresh") : document,
      );
    }
  }
  return datedMetadata;
}

function priorRefreshDates(datedMetadata: Map<string, JsonRecord>, date: string): string[] {
  const priorDates: string[] = [];
  for (const candidate of datedMetadata.keys()) {
    if (candidate === date) continue;
    requiredDate(candidate, "refresh directory date");
    if (candidate < date) priorDates.push(candidate);
  }
  priorDates.sort();
  return priorDates;
}

function assertInitialRefresh(metadata: RefreshMetadata, datedMetadata: Map<string, JsonRecord>, priorDates: string[]): void {
  const initialDates = [...datedMetadata].filter(([date, other]) => date !== metadata.date && other.trigger === "initial").map(([date]) => date).sort();
  if (metadata.trigger === "initial" && initialDates.length > 0) throw new Error(`initial refresh trigger already used by ${initialDates[0]}`);
  const priorDate = priorDates.at(-1);
  if (priorDate === undefined) {
    if (metadata.trigger !== "initial") throw new Error("the first teacher refresh must use the initial trigger");
    return;
  }
  if (metadata.trigger === "initial") throw new Error(`initial refresh trigger cannot follow ${priorDate}`);
}

function assertMonthlyCadence(metadata: RefreshMetadata, priorDates: string[]): void {
  if (metadata.trigger !== "monthly") return;
  const priorDate = priorDates.at(-1);
  if (priorDate === undefined) return;
  const elapsedDays = (Date.parse(metadata.date) - Date.parse(priorDate)) / 86_400_000;
  if (elapsedDays < 28)
    throw new Error(`monthly refresh follows ${priorDate} by only ${elapsedDays} days`);
}

async function teacherMetadata(
  root: string,
  date: string,
): Promise<Manifest["refresh"]["teachers"]> {
  const teachers = [];
  for (const provider of ["codex", "claude"] as const) {
    const runs: JsonRecord[] = [];
    for await (const path of new Bun.Glob(`*/${provider}/run.json`).scan({
      cwd: `${root}/runs/${date}/cases`,
      onlyFiles: true,
    })) {
      runs.push(record(await Bun.file(`${root}/runs/${date}/cases/${path}`).json(), "run"));
    }
    // ADR-0006: current refreshes have no Claude teacher, while the sealed
    // historical refresh still records both.
    if (runs.length === 0 && provider === "claude") continue;
    const models = new Set(runs.map((run) => String(run.model)));
    const versions = new Set(runs.map((run) => String(run.cli_version)));
    if (runs.length !== 20 || models.size !== 1 || versions.size !== 1) {
      throw new Error(`${provider} refresh metadata must identify one model and CLI version`);
    }
    teachers.push({
      provider,
      model: [...models][0]!,
      cli_version: [...versions][0]!,
    });
  }
  return teachers;
}

export async function createManifest(root: string, date: string): Promise<Manifest> {
  const refresh = await readRefreshMetadata(root, date);
  const artifacts = [];
  for (const path of await artifactPaths(root, date)) {
    const file = Bun.file(`${root}/${path}`);
    const sha256 = new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
    artifacts.push({ path, sha256, bytes: file.size });
  }
  return {
    schema_version: 1,
    refresh: {
      date,
      trigger: refresh.trigger,
      ...(refresh.reason === undefined ? {} : { reason: refresh.reason }),
      immutable: true,
      teachers: await teacherMetadata(root, date),
    },
    artifacts,
  };
}
