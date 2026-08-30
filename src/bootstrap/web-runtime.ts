import type { SchedulerConfiguration } from "@/features/configuration";
import {
  createNavigationScheduler,
  createObscuraInstaller,
  createObscuraSupervisor,
  createReconnectingRenderer,
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
  await supervisor.install(new AbortController().signal);
  return {
    // Follows the supervisor across restarts, so one Obscura exit does not turn
    // every later search in a long run into renderer_unavailable.
    renderer: createReconnectingRenderer(supervisor, {
      configuration,
      scheduler,
      policy: runtime.policy,
    }),
    close: () => supervisor.shutdown(),
  };
}
