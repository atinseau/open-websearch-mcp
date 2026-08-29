import { ensureWorkspace, type Workspace } from "@/features/configuration/adapters/workspace";

const forbidden =
  /(?:cookie|secret|token|password|authorization|auth|session|body|html|environment)/iu;

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

function sanitize(value: unknown, key = ""): unknown {
  if (forbidden.test(key)) return "[redacted]";
  if (typeof value === "string") return value.length > 4096 ? "[omitted: too large]" : value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, sanitize(item, name)]),
  );
}
