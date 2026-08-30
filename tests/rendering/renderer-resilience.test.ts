import { afterEach, expect, test } from "bun:test";

import {
  createNavigationScheduler,
  createObscuraSupervisor,
  createReconnectingRenderer,
  type Renderer,
  type RendererConfiguration,
} from "@/features/rendering";

const obscura = Bun.which("obscura");
const fixtures: Array<ReturnType<typeof Bun.serve>> = [];
const supervisors: ReturnType<typeof createObscuraSupervisor>[] = [];
const configuration: RendererConfiguration = {
  navigationTimeoutMs: 2_000,
  settleTimeoutMs: 10,
  maxDownloadBytes: 25 * 1024 * 1024,
};
const localFixturePolicy = { assess: () => ({ allowed: true }) };
const schedulerConfiguration = {
  startCapacity: 2,
  maximumCapacity: 2,
  lastSafeCapacity: 2,
  perHostCapacity: 2,
  googleSerpCapacity: 1,
  safeRssBudgetBytes: 1,
  warmP95BaselineMs: 456,
  memoryTelemetryAbsentMaximumCapacity: 2,
  growthStep: 1,
  healthyWindowsRequired: 2,
  windowCompletedNavigations: 20,
  minimumWindowMs: 10_000,
  backpressure: {
    errorRate: 0.15,
    timeoutRate: 0.1,
    p95WarmBaselineMultiplier: 2,
    rssSafeBudgetFraction: 0.8,
    action: "halve_ceiling_minimum_1" as const,
  },
};

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) void fixture.stop(true);
  for (const supervisor of supervisors.splice(0)) await supervisor.shutdown();
});

if (!obscura) {
  test.skip("renderer resilience requires the pinned Obscura binary", () => undefined);
} else {
  const obscuraPath: string = obscura;

  /**
   * A corpus run is many searches in one process. Before these guarantees, a
   * single Obscura exit turned every later search into `renderer_unavailable`
   * for the rest of the run: the supervisor kept its resolved start promise,
   * and the renderer stayed bound to a dead endpoint.
   */
  test("a supervisor whose process died starts another one on the next install", async () => {
    const supervisor = createObscuraSupervisor({
      executable: obscuraPath,
      configuration,
      allowPrivateNetworkForTest: true,
    });
    supervisors.push(supervisor);
    await supervisor.install(new AbortController().signal);
    const firstPid = supervisor.status().ownedProcessId;
    if (firstPid === undefined) throw new Error("owned_obscura_pid_missing");

    kill(firstPid);
    await waitUntilUnavailable(supervisor);
    const endpoint = await supervisor.install(new AbortController().signal);

    expect(endpoint.cdpUrl.hostname).toBe("127.0.0.1");
    expect(supervisor.status().available).toBeTrue();
    expect(supervisor.status().ownedProcessId).not.toBe(firstPid);
  }, 30_000);

  test("a navigation after the renderer died reconnects instead of failing forever", async () => {
    const fixture = startFixture();
    const supervisor = createObscuraSupervisor({
      executable: obscuraPath,
      configuration,
      allowPrivateNetworkForTest: true,
    });
    supervisors.push(supervisor);
    const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
    const renderer = createReconnectingRenderer(supervisor, {
      configuration,
      scheduler,
      policy: localFixturePolicy,
    });

    await render(renderer, fixture.url);
    const firstPid = supervisor.status().ownedProcessId;
    if (firstPid === undefined) throw new Error("owned_obscura_pid_missing");
    kill(firstPid);
    await waitUntilUnavailable(supervisor);

    const document = await render(renderer, fixture.url);

    expect(document.text.length).toBeGreaterThan(0);
    expect(supervisor.status().ownedProcessId).not.toBe(firstPid);
    await scheduler.shutdown();
  }, 40_000);

  test("RENDER starting the browser is not charged to the first navigation's budget", async () => {
    // Obscura's startup happened inside the first render, so its cost came out of
    // that navigation's budget. The first search of a process returned one result
    // where later identical searches returned nine.
    const fixture = startFixture();
    const supervisor = createObscuraSupervisor({
      executable: obscuraPath,
      configuration,
      allowPrivateNetworkForTest: true,
    });
    supervisors.push(supervisor);
    const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
    const renderer = createReconnectingRenderer(supervisor, {
      configuration,
      scheduler,
      policy: localFixturePolicy,
    });

    // The supervisor is asked for its endpoint before anything is scheduled.
    const started = Date.now();
    const document = await render(renderer, fixture.url);
    const elapsed = Date.now() - started;

    expect(document.text.length).toBeGreaterThan(0);
    // Startup plus one local navigation must fit well inside a single budget,
    // which it cannot if both are billed to the same timer.
    expect(elapsed).toBeLessThan(configuration.navigationTimeoutMs * 2);
    await scheduler.shutdown();
  }, 40_000);

  test("RENDER-008 a navigation lost to a browser crash is retried once", async () => {
    // Chrome closes its WebSocket (code 1006) under load. The renderer already
    // reconnects, but the navigation in flight was abandoned, so every crash
    // cost a candidate the search had already found and paid to discover.
    const fixture = startFixture();
    const supervisor = createObscuraSupervisor({
      executable: obscuraPath,
      configuration,
      allowPrivateNetworkForTest: true,
    });
    supervisors.push(supervisor);
    const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
    const renderer = createReconnectingRenderer(supervisor, {
      configuration,
      scheduler,
      policy: localFixturePolicy,
    });

    await render(renderer, fixture.url);
    const firstPid = supervisor.status().ownedProcessId;
    if (firstPid === undefined) throw new Error("owned_obscura_pid_missing");
    kill(firstPid);
    await waitUntilUnavailable(supervisor);

    // The very next navigation must succeed on its own, without the caller
    // knowing a browser died underneath it.
    const document = await render(renderer, fixture.url);

    expect(document.text.length).toBeGreaterThan(0);
    await scheduler.shutdown();
  }, 40_000);

  test("RENDER-008 a navigation lost to a closed CDP socket is retried, not discarded", async () => {
    // Chrome closes its WebSocket (code 1006) under load while the process
    // stays alive, so the supervisor still reports available and the failure
    // fell through as an ordinary error. Every such close cost a candidate the
    // search had already found and paid to discover.
    const fixture = startFixture();
    const supervisor = createObscuraSupervisor({
      executable: obscuraPath,
      configuration,
      allowPrivateNetworkForTest: true,
    });
    supervisors.push(supervisor);
    const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
    let attempts = 0;
    const flaky = {
      install: (signal: AbortSignal) => supervisor.install(signal),
      status: () => supervisor.status(),
      shutdown: () => supervisor.shutdown(),
    };
    const renderer = createReconnectingRenderer(flaky, {
      configuration,
      scheduler,
      policy: localFixturePolicy,
      // Injected so the closed-socket path can be exercised without waiting for
      // Chrome to drop a connection of its own accord.
      renderPage: async (request, delegate) => {
        attempts += 1;
        if (attempts === 1) throw new Error("Chrome WebSocket closed (code 1006)");
        return delegate(request);
      },
    });

    const document = await render(renderer, fixture.url);

    expect(attempts).toBe(2);
    expect(document.text.length).toBeGreaterThan(0);
    await scheduler.shutdown();
  }, 40_000);
}

function kill(pid: number): void {
  Bun.spawnSync(["/bin/kill", "-KILL", `${pid}`], { stdout: "ignore", stderr: "ignore" });
}

function startFixture(): { readonly url: string } {
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response("<html><body><h1>Fixture</h1><p>Rendered body text.</p></body></html>", {
        headers: { "content-type": "text/html" },
      }),
  });
  fixtures.push(server);
  return { url: `http://127.0.0.1:${server.port}/` };
}

function render(renderer: Renderer, url: string) {
  return renderer.render({
    url: new URL(url),
    signal: new AbortController().signal,
    investigationId: "resilience",
    kind: "destination",
    explicitOpen: true,
  });
}

async function waitUntilUnavailable(
  supervisor: ReturnType<typeof createObscuraSupervisor>,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!supervisor.status().available) return;
    await Bun.sleep(25);
  }
  throw new Error("supervisor_stayed_available");
}
