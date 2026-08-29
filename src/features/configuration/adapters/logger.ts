import { ensureWorkspace } from "@/features/configuration/adapters/workspace";
import type { Workspace } from "@/features/configuration";
import { redactDiagnostic } from "@/features/security";

const eventFields = new Set([
  "query",
  "url",
  "urls",
  "score",
  "scores",
  "decision",
  "status",
  "size_bytes",
  "duration_ms",
  "retries",
  "cache_provenance",
  "error_code",
  "phase",
  "count",
]);

export interface SessionLogger {
  record(event: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
  readonly failed: boolean;
}

export async function createSessionLogger(
  workspace: Workspace,
  report: (message: string) => void,
): Promise<SessionLogger> {
  const id = crypto.randomUUID();
  const path = `${workspace.logs}/${new Date().toISOString().replaceAll(":", "-")}-${id}.jsonl`;
  let failed = false;
  let closed = false;
  let sink: ReturnType<ReturnType<typeof Bun.file>["writer"]> | undefined;
  try {
    ensureWorkspace(workspace);
    await Bun.write(path, "");
    sink = Bun.file(path).writer();
  } catch {
    failed = true;
    report("session_log_start_failed");
  }
  async function write(event: Record<string, unknown>): Promise<void> {
    if (closed || failed) return;
    try {
      await sink?.write(`${JSON.stringify(sanitize(event))}\n`);
      await sink?.flush();
    } catch {
      failed = true;
      report("session_log_write_failed");
    }
  }
  return {
    get failed() {
      return failed;
    },
    record: write,
    async close() {
      closed = true;
      await sink?.end();
    },
  };
}

function sanitize(event: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event)
      .filter(([key]) => eventFields.has(key))
      .map(([key, value]) => [key, sanitizeValue(key, value)]),
  );
}

function sanitizeValue(key: string, value: unknown): unknown {
  const special = sanitizeUrlField(key, value);
  return special.handled ? special.value : sanitizeScalar(value);
}

function sanitizeUrlField(key: string, value: unknown): { handled: boolean; value: unknown } {
  if (key === "url")
    return {
      handled: true,
      value: typeof value === "string" ? sanitizeUrl(value) : "[invalid_url]",
    };
  if (key === "urls")
    return {
      handled: true,
      value: Array.isArray(value) ? value.map((item) => sanitizeUrl(String(item))) : [],
    };
  return { handled: false, value: undefined };
}

function sanitizeScalar(value: unknown): unknown {
  // A search query is caller-supplied text and can carry a credential. URL
  // fields are already sanitized; every other string still needs the same
  // treatment before it reaches the session log.
  if (typeof value === "string")
    return value.length > 1024 ? "[omitted: too_large]" : redactDiagnostic(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return value;
  return "[omitted]";
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "[invalid_url]";
  }
}
