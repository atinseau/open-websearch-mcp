import { afterEach, expect, test } from "bun:test";

import {
  createNavigationScheduler,
  createObscuraSupervisor,
  createWebViewRenderer,
  type RendererConfiguration,
} from "@/features/rendering";
import { assessPublicUrl } from "@/features/security";

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

test("SECURITY-004 renderer refuses a private initial destination before creating a WebView", async () => {
  let scheduled = false;
  const renderer = createWebViewRenderer({
    endpoint: { cdpUrl: new URL("ws://127.0.0.1:9222") },
    configuration,
    scheduler: {
      async schedule() {
        scheduled = true;
        throw new Error("scheduler_called");
      },
      async shutdown() {},
    },
    policy: { assess: assessPublicUrl },
  });
  expect(await rejection(render(renderer, "http://127.0.0.1:8080/admin"))).toContain(
    "non_public_address",
  );
  expect(scheduled).toBeFalse();
});

if (!obscura) {
  test.skip("RENDER-001 requires the pinned Obscura binary", () => undefined);
} else {
  const obscuraPath: string = obscura ?? "";
  test("RENDER-003/004/006/007/ORCH-008 renders isolated targets and cleans its owned group", async () => {
    const fixture = startFixture();
    const supervisor = createObscuraSupervisor({
      executable: obscuraPath,
      configuration,
      allowPrivateNetworkForTest: true,
    });
    supervisors.push(supervisor);
    const endpoint = await supervisor.install(new AbortController().signal);
    const renderer = createWebViewRenderer({
      endpoint,
      configuration,
      scheduler: createNavigationScheduler({ configuration: schedulerConfiguration }),
      policy: localFixturePolicy,
    });
    const first = await render(renderer, `${fixture.url}set`);
    const second = await render(renderer, `${fixture.url}read`);
    expect(first.text).toContain("rendered by JavaScript");
    expect(first.markdown).toContain("rendered by JavaScript");
    expect(first.links.map((link) => link.url.pathname)).toContain("/linked");
    expect(second.text).toContain("empty");
    expect(endpoint.cdpUrl.hostname).toBe("127.0.0.1");
    expect(supervisor.status().endpoint?.toString() ?? "").toBe(endpoint.cdpUrl.toString());

    const ownedPid = supervisor.status().ownedProcessId;
    if (ownedPid === undefined) throw new Error("owned_obscura_pid_missing");
    await supervisor.shutdown();
    expect(await endpointClosed(endpoint.cdpUrl)).toBe(true);
    expect(processesInGroup(ownedPid)).toBe("");
  }, 20_000);

  test("RENDER-007 aborts a timed navigation and RENDER download accounting stops over-budget targets", async () => {
    const fixture = startFixture();
    const supervisor = createObscuraSupervisor({
      executable: obscuraPath,
      configuration,
      allowPrivateNetworkForTest: true,
    });
    supervisors.push(supervisor);
    const endpoint = await supervisor.install(new AbortController().signal);
    const scheduler = createNavigationScheduler({ configuration: schedulerConfiguration });
    const renderer = createWebViewRenderer({
      endpoint,
      configuration: { ...configuration, navigationTimeoutMs: 100, maxDownloadBytes: 1024 },
      scheduler,
      policy: localFixturePolicy,
    });
    expect(await rejection(render(renderer, `${fixture.url}slow`))).toContain("navigation_timeout");
    expect(await rejection(render(renderer, `${fixture.url}large`))).toContain(
      "download_budget_exceeded",
    );
    expect(await rejection(render(renderer, `${fixture.url}stream`))).toContain(
      "download_budget_exceeded",
    );
    await scheduler.shutdown();
  }, 20_000);

  test("SECURITY-004 Obscura 0.2.1 blocks private addresses before any fixture request", async () => {
    const fixture = startSecurityFixture();
    const supervisor = createObscuraSupervisor({ executable: obscuraPath, configuration });
    supervisors.push(supervisor);
    const endpoint = await supervisor.install(new AbortController().signal);
    const renderer = createWebViewRenderer({
      endpoint,
      configuration,
      scheduler: createNavigationScheduler({ configuration: schedulerConfiguration }),
      policy: localFixturePolicy,
    });
    for (const target of [
      `${fixture.url}direct`,
      fixture.url.replace("127.0.0.1", "127.0.0.1.nip.io") + "rebound",
      `${fixture.url}redirect-to-private`,
    ]) {
      expect(await rejection(render(renderer, target))).not.toBe("resolved");
      expect(fixture.hits()).toBe(0);
    }
  }, 20_000);
}

function startFixture() {
  const fixture = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/slow") {
        await Bun.sleep(1_000);
        return html("slow");
      }
      if (path === "/large")
        return new Response("x".repeat(4_096), { headers: { "content-type": "text/plain" } });
      if (path === "/stream")
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("x".repeat(768)));
              controller.enqueue(new TextEncoder().encode("x".repeat(768)));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/plain" } },
        );
      if (path === "/set") return html("set", { "set-cookie": "isolated=yes" });
      if (path === "/read")
        return html(request.headers.get("cookie")?.includes("isolated=yes") ? "leaked" : "empty");
      return html("linked");
    },
  });
  fixtures.push(fixture);
  return fixture;
}

function startSecurityFixture(): { readonly url: string; hits(): number } {
  let requests = 0;
  const fixture = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      requests++;
      if (new URL(request.url).pathname === "/redirect-to-private")
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        });
      return html("security fixture");
    },
  });
  fixtures.push(fixture);
  return { url: new URL(fixture.url).href, hits: () => requests };
}

function html(label: string, headers: Record<string, string> = {}): Response {
  return new Response(
    `<main id="app"></main><a href="/linked">A rendered link</a><script>document.querySelector('#app').textContent='${label} rendered by JavaScript'</script>`,
    { headers: { "content-type": "text/html; charset=utf-8", ...headers } },
  );
}

async function render(renderer: ReturnType<typeof createWebViewRenderer>, path: string) {
  const url = new URL(path);
  return await renderer.render({
    url,
    signal: new AbortController().signal,
    investigationId: `fixture-${crypto.randomUUID()}`,
    kind: "destination",
    explicitOpen: true,
  });
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof Error ? error.message : "unknown";
  }
}

async function endpointClosed(url: URL): Promise<boolean> {
  try {
    await fetch(new URL("/json/version", url.toString().replace("ws:", "http:")));
    return false;
  } catch {
    return true;
  }
}

function processesInGroup(pid: number): string {
  return Bun.spawnSync(["/bin/ps", "-o", "pid=", "-g", `${pid}`])
    .stdout.toString()
    .trim();
}
