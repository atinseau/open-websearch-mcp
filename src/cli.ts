import { createConfigurationService, resolveWorkspace } from "@/features/configuration";
import { createProductionRoot } from "@/bootstrap";
import { serveStdio } from "@/mcp";

export interface CliDependencies {
  startMcp(): Promise<void>;
  doctor(): Promise<unknown>;
  benchmark(): Promise<void>;
  write(value: string): void;
}

/** Routes the public executable without starting a daemon or performing Web discovery. */
export async function runCli(
  arguments_: readonly string[],
  dependencies: CliDependencies,
): Promise<void> {
  const command = arguments_[0];
  if (!command) return dependencies.startMcp();
  if (command === "doctor")
    return dependencies.write(`${JSON.stringify(await dependencies.doctor())}\n`);
  if (command === "benchmark") return dependencies.benchmark();
  throw new Error(`unknown_command:${command}`);
}

if (import.meta.main) {
  const configuration = createConfigurationService({ workspace: resolveWorkspace() });
  await runCli(Bun.argv.slice(2), {
    async startMcp() {
      const root = await createProductionRoot({});
      try {
        await serveStdio(root.tools, root.maxInboundMessageBytes);
        await new Promise<void>((resolve) => process.stdin.once("end", resolve));
      } finally {
        await root.close();
      }
    },
    doctor: () => configuration.doctor(),
    async benchmark() {
      console.error("benchmark_not_available");
    },
    write: (value) => console.log(value.trimEnd()),
  });
}
