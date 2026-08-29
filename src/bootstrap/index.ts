import {
  createConfigurationService,
  createSessionLogger,
  resolveWorkspace,
  type Workspace,
} from "@/features/configuration";
import {
  createNavigationScheduler,
  createObscuraInstaller,
  createObscuraSupervisor,
  createWebViewRenderer,
  type ObscuraArtifact,
  type Renderer,
  type RendererConfiguration,
} from "@/features/rendering";
import {
  assessPublicUrl,
  createDnsResolver,
  createRobotsPolicy,
  type PublicUrlPolicy,
  type RobotsPolicy,
} from "@/features/security";
import { BlobStore, createStorage, SqliteStore, type Storage } from "@/features/storage";
import {
  createWebResearchApplication,
  type CallContext,
  type InvestigationApplication,
} from "@/features/investigation";
import type { McpToolAdapter, McpToolDependencies } from "@/mcp";
import { createMcpToolAdapter } from "@/mcp/tools";

import { productionObscuraArtifact } from "./obscura-artifact.ts";

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
  readonly application?: InvestigationApplication;
  readonly workspace?: Workspace;
  readonly probe?: (executable: string) => Promise<boolean>;
  /** Test-only override; production always uses the immutable package pin. */
  readonly obscuraArtifact?: ObscuraArtifact;
  readonly robots?: RobotsPolicy;
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
  const installer = createObscuraInstaller(workspace, options.probe ?? probeObscura);
  const web = createWebRuntime(
    installer,
    options.obscuraArtifact ??
      configuredObscuraArtifact(first.configuration?.renderer.obscura, workspace.config),
    rendererConfiguration(first.configuration?.renderer),
    first.scheduler,
  );
  const application = applicationFor(
    options.application,
    storage,
    web?.renderer,
    // A resolver is supplied so the robots lookup proves its host is public
    // before connecting. Without it the static URL check passes any public
    // hostname, including one that resolves to a private address.
    options.robots ?? createRobotsPolicy({ resolver: createDnsResolver() }),
  );
  bindWebRuntime(application, web.renderer, web.policy);
  const tools = makeTools(application, configuration, logger, installer);
  return {
    tools,
    storage,
    maxInboundMessageBytes: first.configuration?.mcp.max_inbound_message_bytes ?? 4 * 1024 * 1024,
    async close() {
      await web.close();
      storage.close();
      await logger.close();
    },
  };
}

function configuredObscuraArtifact(
  configured: { readonly version: string; readonly variant: string } | undefined,
  configPath: string,
): ObscuraArtifact {
  if (
    configured &&
    (configured.version !== productionObscuraArtifact.version ||
      configured.variant !== "aarch64-macos-stealth")
  )
    throw new Error(
      `obscura_release_pin_not_packaged: ${configPath} requests ${configured.version}/${configured.variant}; expected ${productionObscuraArtifact.version}/aarch64-macos-stealth. Remove the renderer.obscura override or set the packaged pin.`,
    );
  return productionObscuraArtifact;
}

async function probeObscura(executable: string): Promise<boolean> {
  const process = Bun.spawn([executable, "--version"], { stdout: "ignore", stderr: "ignore" });
  return (await process.exited) === 0;
}

function applicationFor(
  application: InvestigationApplication | undefined,
  storage: Storage,
  renderer: Renderer | undefined,
  robots: RobotsPolicy,
): InvestigationApplication {
  return application ?? createWebResearchApplication({ storage, renderer, robots });
}

function rendererConfiguration(
  renderer:
    | {
        readonly navigation_timeout_ms: number;
        readonly settle_timeout_ms: number;
        readonly max_download_bytes: number;
      }
    | undefined,
): RendererConfiguration | undefined {
  return renderer
    ? {
        navigationTimeoutMs: renderer.navigation_timeout_ms,
        settleTimeoutMs: renderer.settle_timeout_ms,
        maxDownloadBytes: renderer.max_download_bytes,
      }
    : undefined;
}

type WebRuntimeConsumer = InvestigationApplication & {
  bindWebRuntime?(renderer: Renderer, policy: PublicUrlPolicy): void;
};

function bindWebRuntime(
  application: InvestigationApplication,
  renderer: Renderer | undefined,
  policy: PublicUrlPolicy | undefined,
): void {
  if (renderer && policy) (application as WebRuntimeConsumer).bindWebRuntime?.(renderer, policy);
}

function createWebRuntime(
  installer: ReturnType<typeof createObscuraInstaller>,
  artifact: ObscuraArtifact,
  configuration: RendererConfiguration | undefined,
  schedulerConfiguration: import("@/features/configuration").SchedulerConfiguration,
): { readonly renderer: Renderer; readonly policy: PublicUrlPolicy; close(): Promise<void> } {
  if (!configuration) throw new Error("renderer_configuration_missing");
  const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
  const policy: PublicUrlPolicy = { assess: assessPublicUrl };
  let started:
    | Promise<{ readonly renderer: Renderer; readonly close: () => Promise<void> }>
    | undefined;
  return {
    policy,
    renderer: {
      render: async (request) => {
        const assessment = policy.assess(request.url);
        if (!assessment.allowed) throw new Error(assessment.reason ?? "non_public_destination");
        started ??= startRenderer(installer, artifact, configuration, scheduler, policy);
        return (await started).renderer.render(request);
      },
    },
    async close() {
      await scheduler.shutdown();
      await started?.then((runtime) => runtime.close());
    },
  };
}

async function startRenderer(
  installer: ReturnType<typeof createObscuraInstaller>,
  artifact: ObscuraArtifact,
  configuration: RendererConfiguration,
  scheduler: ReturnType<typeof createNavigationScheduler>,
  policy: PublicUrlPolicy,
): Promise<{ readonly renderer: Renderer; readonly close: () => Promise<void> }> {
  const installed = await installer.ensure(artifact);
  const supervisor = createObscuraSupervisor({ executable: `${installed}/obscura`, configuration });
  const endpoint = await supervisor.install(new AbortController().signal);
  const renderer = createWebViewRenderer({ endpoint, configuration, scheduler, policy });
  return {
    renderer: {
      async render(request) {
        if (!supervisor.status().available) throw new Error("renderer_unavailable");
        try {
          return await renderer.render(request);
        } catch (error) {
          if (!supervisor.status().available)
            throw new Error("renderer_unavailable", { cause: error });
          throw error;
        }
      },
    },
    close: () => supervisor.shutdown(),
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
