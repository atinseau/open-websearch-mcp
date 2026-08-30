import type {
  ObscuraSupervisorOptions,
  RendererEndpoint,
  RendererSupervisor,
} from "@/features/rendering";

import { obscuraServeArguments } from "./obscura-arguments.ts";

const startupTimeoutMs = 5_000;
const shutdownTimeoutMs = 5_000;

/** Owns a detached Obscura process group and never looks for another browser. */
export class ObscuraSupervisor implements RendererSupervisor {
  readonly #options: ObscuraSupervisorOptions;
  #child: ReturnType<typeof Bun.spawn> | undefined;
  #endpoint: RendererEndpoint | undefined;
  #starting: Promise<RendererEndpoint> | undefined;

  constructor(options: ObscuraSupervisorOptions) {
    this.#options = options;
  }

  install(signal: AbortSignal): Promise<RendererEndpoint> {
    if (signal.aborted) return Promise.reject(abortError(signal.reason));
    if (this.#endpoint) return Promise.resolve(this.#endpoint);
    this.#starting ??= this.#start();
    return raceAbort(this.#starting, signal);
  }

  status() {
    return {
      ownedProcessId: this.#child?.pid,
      endpoint: this.#endpoint?.cdpUrl,
      available: this.#child?.exitCode === null && this.#endpoint !== undefined,
    };
  }

  async shutdown(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#endpoint = undefined;
    this.#starting = undefined;
    if (!child || child.exitCode !== null) return;
    signalGroup(child.pid, "TERM");
    try {
      await withTimeout(child.exited, shutdownTimeoutMs);
    } catch {
      signalGroup(child.pid, "KILL");
      await child.exited;
    }
  }

  async #start(): Promise<RendererEndpoint> {
    const port = loopbackPort();
    if (this.#options.allowPrivateNetworkForTest && Bun.env.NODE_ENV !== "test")
      throw new Error("private_network_test_switch_forbidden");
    const child = Bun.spawn(
      [
        this.#options.executable,
        ...obscuraServeArguments({
          host: "127.0.0.1",
          port,
          storageDirectory: this.#options.storageDirectory,
          allowPrivateNetwork: this.#options.allowPrivateNetworkForTest,
        }),
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true },
    );
    this.#child = child;
    void child.exited.then(() => {
      if (this.#child === child) this.#endpoint = undefined;
    });
    try {
      const endpoint = await withTimeout(waitForEndpoint(port, child), startupTimeoutMs);
      this.#endpoint = endpoint;
      return endpoint;
    } catch (error) {
      await this.shutdown();
      throw new Error(`renderer_unavailable: ${message(error)}`, { cause: error });
    }
  }
}

async function waitForEndpoint(
  port: number,
  child: ReturnType<typeof Bun.spawn>,
): Promise<RendererEndpoint> {
  const versionUrl = new URL(`http://127.0.0.1:${port}/json/version`);
  while (child.exitCode === null) {
    try {
      const response = await fetch(versionUrl);
      const version = await response.json();
      const cdp = isRecord(version) ? version.webSocketDebuggerUrl : undefined;
      if (response.ok && typeof cdp === "string") {
        const cdpUrl = new URL(cdp);
        if (cdpUrl.protocol === "ws:" && cdpUrl.hostname === "127.0.0.1") return { cdpUrl };
        throw new Error("obscura_non_loopback_cdp_endpoint");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "obscura_non_loopback_cdp_endpoint")
        throw error;
    }
    await Bun.sleep(50);
  }
  throw new Error("obscura_exited_before_ready");
}

function loopbackPort(): number {
  return 45_000 + Math.floor(Math.random() * 5_000);
}

function signalGroup(pid: number, signal: "TERM" | "KILL"): void {
  Bun.spawnSync(["/bin/kill", `-${signal}`, `-${pid}`], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
}

async function withTimeout<Value>(promise: Promise<Value>, timeoutMs: number): Promise<Value> {
  return await Promise.race([
    promise,
    new Promise<Value>((_resolve, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs),
    ),
  ]);
}

function raceAbort<Value>(promise: Promise<Value>, signal: AbortSignal): Promise<Value> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(abortError(signal.reason));
    signal.addEventListener("abort", cancel, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

function abortError(reason: unknown): Error {
  return new Error(typeof reason === "string" ? reason : "aborted");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
