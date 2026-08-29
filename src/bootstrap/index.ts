import {
  createConfigurationService,
  createObscuraInstaller,
  createSessionLogger,
  resolveWorkspace,
  type Workspace,
} from "@/features/configuration";
import { BlobStore, createStorage, SqliteStore, type Storage } from "@/features/storage";
import type { CallContext, InvestigationApplication } from "@/features/investigation";
import type { McpToolAdapter, McpToolDependencies } from "@/mcp";
import { createMcpToolAdapter } from "@/mcp/tools";

/** Composition root; future infrastructure is assembled here, not in features. */
export function composeMcpTools(dependencies: McpToolDependencies): McpToolAdapter {
  return createMcpToolAdapter(dependencies);
}

export interface ProductionRoot {
  readonly tools: McpToolAdapter;
  readonly maxInboundMessageBytes: number;
  readonly storage: Storage;
  close(): Promise<void>;
}

export interface ProductionRootOptions {
  readonly application: InvestigationApplication;
  readonly workspace?: Workspace;
  readonly probe?: (executable: string) => Promise<boolean>;
}

/** Builds the runtime once; every tool call reloads config before crossing the application seam. */
export async function createProductionRoot(
  options: ProductionRootOptions,
): Promise<ProductionRoot> {
  const workspace = options.workspace ?? resolveWorkspace();
  const configuration = createConfigurationService({ workspace });
  const first = await configuration.prepareForCall();
  await Promise.all([
    Bun.write(`${workspace.root}/.storage-ready`, ""),
    Bun.write(`${workspace.root}/cache/blobs/.storage-ready`, ""),
  ]);
  const storage = createStorage(
    new SqliteStore({ path: `${workspace.root}/state.sqlite` }),
    new BlobStore(`${workspace.root}/cache/blobs`),
  );
  const logger = await createSessionLogger(workspace, (message) => console.error(message));
  const installer = createObscuraInstaller(workspace, options.probe ?? (async () => false));
  const tools = makeTools(options.application, configuration, logger, installer);
  return {
    tools,
    storage,
    maxInboundMessageBytes: first.configuration?.mcp.max_inbound_message_bytes ?? 4 * 1024 * 1024,
    async close() {
      storage.close();
      await logger.close();
    },
  };
}

function makeTools(
  application: InvestigationApplication,
  configuration: ReturnType<typeof createConfigurationService>,
  logger: Awaited<ReturnType<typeof createSessionLogger>>,
  installer: ReturnType<typeof createObscuraInstaller>,
): McpToolAdapter {
  return {
    webSearch: (input, signal) =>
      run("web_search", input.query, signal, (context) => application.webSearch(input, context)),
    webOpen: (input, signal) =>
      run("web_open", input.url.href, signal, (context) => application.webOpen(input, context)),
  };
  async function run<Result>(
    operation: string,
    subject: string,
    signal: AbortSignal | undefined,
    execute: (context: CallContext) => Promise<Result>,
  ): Promise<Result> {
    const snapshot = await configuration.prepareForCall();
    const abortController = new AbortController();
    if (signal?.aborted) abortController.abort(signal.reason);
    const relay = () => abortController.abort(signal?.reason);
    signal?.addEventListener("abort", relay, { once: true });
    const context = { abortController, configuration: snapshot };
    await logger.record({ decision: operation, query: subject, status: "started" });
    // The installer is owned by this root; Web wiring will call its release-backed ensure method.
    void installer.activeVersion();
    try {
      const result = await execute(context);
      await logger.record({ decision: operation, status: "completed" });
      return result;
    } catch (error) {
      await logger.record({ decision: operation, status: "failed", error_code: "runtime_failure" });
      throw error;
    } finally {
      signal?.removeEventListener("abort", relay);
    }
  }
}
