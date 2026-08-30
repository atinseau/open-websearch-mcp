import type { SchedulerConfiguration } from "@/features/configuration";
import {
  createNavigationScheduler,
  createObscuraInstaller,
  createObscuraSupervisor,
  createWebViewRenderer,
  type ObscuraArtifact,
  type Renderer,
  type RendererConfiguration,
} from "@/features/rendering";
import { assessPublicUrl, type PublicUrlPolicy } from "@/features/security";

export function createWebRuntime(
  installer: ReturnType<typeof createObscuraInstaller>,
  artifact: ObscuraArtifact,
  configuration: RendererConfiguration | undefined,
  schedulerConfiguration: SchedulerConfiguration,
  storageDirectory?: string,
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
        started ??= startRenderer(installer, artifact, configuration, scheduler, {
          policy,
          storageDirectory,
        });
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
  runtime: { readonly policy: PublicUrlPolicy; readonly storageDirectory?: string },
): Promise<{ readonly renderer: Renderer; readonly close: () => Promise<void> }> {
  const installed = await installer.ensure(artifact);
  const supervisor = createObscuraSupervisor({
    executable: `${installed}/obscura`,
    configuration,
    storageDirectory: runtime.storageDirectory,
  });
  const endpoint = await supervisor.install(new AbortController().signal);
  const renderer = createWebViewRenderer({
    endpoint,
    configuration,
    scheduler,
    policy: runtime.policy,
  });
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
