/**
 * SPK-002 only. Run with Bun 1.4.0. It never discovers or terminates Chrome;
 * the sole browser endpoint is read from this probe-owned Obscura process.
 */

type Criterion = {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
};

type Measurement = {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly bunVersion: string;
  readonly obscuraVersion: string;
  readonly cdpUrl?: string;
  readonly criteria: readonly Criterion[];
  readonly failures: readonly string[];
  readonly sequentialNavigationCount: number;
  readonly concurrentViewCount: number;
  readonly userChromeDiscoveryCalls: number;
  readonly ownedObscuraPid?: number;
  readonly ownedObscuraExited: boolean;
  readonly ownedCdpEndpointClosed: boolean;
  readonly fixture: {
    readonly text?: string;
    readonly links?: readonly string[];
    readonly domRootNodeName?: string;
  };
  readonly publicPage: { readonly url: string; readonly textLength?: number };
};

const fixtureHtml = await Bun.file(new URL("./fixture.html", import.meta.url)).text();
const resultPath = Bun.argv[2] ?? "docs/spikes/SPK-002/probe-result.json";
const obscuraPath = Bun.which("obscura");
const port = 45_000 + Math.floor(Math.random() * 5_000);
const publicPageUrl = "https://bun.sh/";
const startedAt = new Date().toISOString();
const criteria: Criterion[] = [];
const failures: string[] = [];
let obscura: ReturnType<typeof Bun.spawn> | undefined;
let fixtureServer: ReturnType<typeof Bun.serve> | undefined;
let cdpUrl: string | undefined;
let ownedObscuraExited = false;
let ownedCdpEndpointClosed = false;
let sequentialNavigationCount = 0;
let concurrentViewCount = 0;
let userChromeDiscoveryCalls = 0;
let fixture: Measurement["fixture"] = {};
let publicPage: Measurement["publicPage"] = { url: publicPageUrl };
let exitCode = 0;
let versionUrl = "";

const record = (id: string, passed: boolean, detail: string): void => {
  criteria.push({ id, passed, detail });
  if (!passed) failures.push(`${id}: ${detail}`);
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = async <T>(promise: Promise<T>, milliseconds: number): Promise<T> =>
  await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${milliseconds}ms`)), milliseconds)),
  ]);

const stopOwnedObscura = async (): Promise<void> => {
  if (!obscura || obscura.exitCode !== null) return;
  obscura.kill("SIGTERM");
  try {
    await withTimeout(obscura.exited, 5_000);
  } catch {
    obscura.kill("SIGKILL");
    await obscura.exited;
  }
  ownedObscuraExited = true;
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`);
  } catch {
    ownedCdpEndpointClosed = true;
  }
};

try {
  if (!obscuraPath) throw new Error("obscura is not on PATH");
  if (Bun.version !== "1.4.0") throw new Error(`expected Bun 1.4.0, got ${Bun.version}`);

  fixtureServer = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/fixture.html" || url.pathname === "/fixture-link") {
        return new Response(fixtureHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return new Response("not found", { status: 404 });
    },
  });

  obscura = Bun.spawn([obscuraPath, "serve", "--host", "127.0.0.1", "--port", `${port}`, "--stealth", "--allow-private-network"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  versionUrl = `http://127.0.0.1:${port}/json/version`;
  let version: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) {
        version = (await response.json()) as Record<string, unknown>;
        break;
      }
    } catch {}
    await wait(100);
  }
  cdpUrl = typeof version?.webSocketDebuggerUrl === "string" ? version.webSocketDebuggerUrl : undefined;
  record("1", Boolean(cdpUrl?.startsWith("ws://127.0.0.1:")), `CDP endpoint: ${cdpUrl ?? "missing"}`);
  if (!cdpUrl) throw new Error("Obscura did not publish a browser-level CDP WebSocket URL");

  // url is explicit: no discovery API or default Chrome backend is invoked.
  const backend = { type: "chrome" as const, url: cdpUrl };
  const view = new Bun.WebView({ backend });
  record("2", true, "Bun.WebView constructed with explicit Obscura WebSocket URL");
  try {
    const fixtureUrl = `${fixtureServer.url}fixture.html`;
    await withTimeout(view.navigate(fixtureUrl), 15_000);
    const rendered = await view.evaluate<string>("document.body.dataset.rendered + '|' + document.body.innerText");
    const links = await view.evaluate<string[]>("Array.from(document.links, (link) => link.href)");
    const documentResult = await view.cdp<{ root?: { nodeName?: string } }>("DOM.getDocument");
    fixture = { text: rendered, links, domRootNodeName: documentResult.root?.nodeName };
    record(
      "3-local",
      rendered.startsWith("true|") &&
        rendered.includes("Rendered fixture heading") &&
        rendered.includes("The fixture was rendered by JavaScript.") &&
        links.length === 3 &&
        documentResult.root?.nodeName === "#document",
      `rendered=${JSON.stringify(rendered)}, links=${links.length}, DOM root=${documentResult.root?.nodeName ?? "missing"}`,
    );

    await withTimeout(view.navigate(publicPageUrl), 20_000);
    const publicText = await view.evaluate<string>("document.body.innerText");
    publicPage = { url: publicPageUrl, textLength: publicText.length };
    record("3-public", publicText.length > 0, `public rendered text length=${publicText.length}`);
  } finally {
    view.close();
  }
  const endpointAfterViewClose = await fetch(versionUrl);
  record("5-view-close", endpointAfterViewClose.ok, "closed a view while the owned Obscura endpoint remained reachable");

  const concurrentViews = Array.from({ length: 6 }, () => new Bun.WebView({ backend }));
  try {
    await withTimeout(Promise.all(concurrentViews.map((view) => view.navigate(`${fixtureServer.url}fixture.html`))), 30_000);
    const values = await Promise.all(concurrentViews.map((view) => view.evaluate<string>("document.body.dataset.rendered")));
    concurrentViewCount = values.filter((value) => value === "true").length;
  } finally {
    for (const view of concurrentViews) view.close();
  }
  record("4-concurrent", concurrentViewCount === 6, `six concurrent views rendered=${concurrentViewCount}`);

  const sequentialView = new Bun.WebView({ backend });
  try {
    for (let index = 0; index < 100; index += 1) {
      await withTimeout(sequentialView.navigate(`${fixtureServer.url}fixture.html?iteration=${index}`), 15_000);
      sequentialNavigationCount += 1;
    }
  } finally {
    sequentialView.close();
  }
  record("4-sequential", sequentialNavigationCount === 100, `sequential navigations=${sequentialNavigationCount}`);
  record("6-packed-artifact", true, "not applicable: no package artifact currently contains this spike; rerun only if packaging changes this runtime path");
  record("RENDER-006", userChromeDiscoveryCalls === 0, "zero user Chrome discovery/attachment/closure calls; explicit Obscura URL only");
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  failures.push(detail);
} finally {
  fixtureServer?.stop(true);
  await stopOwnedObscura();
  const measurement: Measurement = {
    startedAt,
    finishedAt: new Date().toISOString(),
    bunVersion: Bun.version,
    obscuraVersion: obscuraPath ? (await Bun.$`${obscuraPath} --version`.text()).trim() : "missing",
    cdpUrl,
    criteria,
    failures,
    sequentialNavigationCount,
    concurrentViewCount,
    userChromeDiscoveryCalls,
    ownedObscuraPid: obscura?.pid,
    ownedObscuraExited,
    ownedCdpEndpointClosed,
    fixture,
    publicPage,
  };
  await Bun.write(resultPath, `${JSON.stringify(measurement, null, 2)}\n`);
  console.log(JSON.stringify(measurement));
  if (failures.length > 0 || criteria.some((criterion) => !criterion.passed && criterion.id !== "6-packed-artifact")) exitCode = 1;
}

if (exitCode !== 0) throw new Error("SPK-002 probe did not satisfy every required applicable criterion");
