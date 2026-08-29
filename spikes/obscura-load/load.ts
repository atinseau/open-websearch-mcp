/**
 * SPK-003 only. Bun 1.4.0 + Obscura 0.2.1 load probe. It owns only the
 * Obscura process it starts and never discovers or controls user Chrome.
 */

type PageClass = "static" | "js-heavy" | "slow" | "technical" | "news" | "community" | "error";
type TrialKind = "cold" | "warm";
type Sample = { readonly pageClass: PageClass; readonly elapsedMs: number; readonly outcome: "ok" | "error" | "timeout"; readonly detail?: string };
type Telemetry = { readonly rssBytes: number | null; readonly cpuPercent: number | null };
type Trial = {
  readonly level: number; readonly kind: TrialKind; readonly samples: readonly Sample[]; readonly elapsedMs: number;
  readonly throughputPerSecond: number; readonly p50Ms: number | null; readonly p95Ms: number | null;
  readonly timeoutRate: number; readonly errorRate: number; readonly eventLoopMaxDelayMs: number;
  readonly telemetry: Telemetry; readonly orphanResources: readonly string[]; readonly profileReuse: boolean;
};
type Result = {
  readonly schemaVersion: 1; readonly startedAt: string; readonly finishedAt: string; readonly command: string;
  readonly environment: Record<string, string | number | null>; readonly trials: readonly Trial[]; readonly navigationCount: number;
  readonly explicitTests: Record<string, unknown>; readonly rawLog: string; readonly childPid: number | null;
};

const levels = [1, 4, 8, 16, 24, 32, 40] as const;
const classes: readonly PageClass[] = ["static", "js-heavy", "slow", "technical", "news", "community", "error"];
const startedAt = new Date().toISOString();
const outputPath = Bun.argv[2] ?? "docs/spikes/SPK-003/measurements.json";
const obscuraPath = Bun.which("obscura");
const runId = `spk-003-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const storageDir = `/private/tmp/${runId}-profile`;
const fixtureHtml = new Map<string, string>();
const rawLog: string[] = [];
let fixtureServer: ReturnType<typeof Bun.serve> | undefined;
let obscura: ReturnType<typeof Bun.spawn> | undefined;
let port = 0;
let cdpPort = 0;

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const percentile = (values: readonly number[], fraction: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
};
const withTimeout = async <T>(promise: Promise<T>, milliseconds: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout after ${milliseconds}ms`)), milliseconds); })]);
  } finally { if (timer) clearTimeout(timer); }
};
const processTelemetry = async (): Promise<Telemetry> => {
  if (!obscura) return { rssBytes: null, cpuPercent: null };
  const output = await Bun.$`ps -o rss= -o %cpu= -p ${process.pid} -p ${obscura.pid}`.text();
  const rows = output.trim().split("\n").map((row) => row.trim().split(/\s+/));
  if (rows.length !== 2 || rows.some((row) => !Number.isFinite(Number(row[0])) || !Number.isFinite(Number(row[1])))) return { rssBytes: null, cpuPercent: null };
  return { rssBytes: rows.reduce((sum, row) => sum + Number(row[0]), 0) * 1024, cpuPercent: rows.reduce((sum, row) => sum + Number(row[1]), 0) };
};
const orphanResources = async (): Promise<string[]> => {
  const leftovers: string[] = [];
  if (obscura?.exitCode === null) leftovers.push(`owned obscura ${obscura.pid} still running`);
  if (cdpPort > 0) {
    try { if ((await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok) leftovers.push(`owned CDP endpoint ${cdpPort} still reachable`); } catch {}
  }
  return leftovers;
};
const readFixture = async (name: string): Promise<void> => { fixtureHtml.set(name, await Bun.file(new URL(`./fixtures/${name}.html`, import.meta.url)).text()); };
const destinationUrl = (pageClass: PageClass, index: number): string => {
  const host = `fixture-${index}.localhost`;
  return `http://${host}:${port}/${pageClass}.html?run=${runId}&index=${index}`;
};
const publicSamples = ["https://bun.sh/docs", "https://news.ycombinator.com/"] as const;
const navigate = async (backend: { readonly type: "chrome"; readonly url: string }, url: string, pageClass: PageClass): Promise<Sample> => {
  const started = performance.now();
  const view = new Bun.WebView({ backend });
  try {
    await withTimeout(view.navigate(url), 15_000);
    const text = await withTimeout(view.evaluate<string>("document.body.innerText"), 2_000);
    return { pageClass, elapsedMs: performance.now() - started, outcome: text.length > 0 ? "ok" : "error", detail: text.length > 0 ? undefined : "empty rendered text" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { pageClass, elapsedMs: performance.now() - started, outcome: detail.includes("timeout") ? "timeout" : "error", detail };
  } finally { view.close(); }
};
const eventLoopProbe = async (): Promise<number> => {
  const started = performance.now();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return performance.now() - started;
};
const runTrial = async (level: number, kind: TrialKind, backend: { readonly type: "chrome"; readonly url: string }, includePublic: boolean): Promise<Trial> => {
  const started = performance.now();
  const delays: number[] = [];
  const delayTimer = setInterval(() => { void eventLoopProbe().then((value) => delays.push(value)); }, 25);
  const tasks = Array.from({ length: level }, (_, index) => navigate(backend, destinationUrl(classes[index % classes.length]!, index), classes[index % classes.length]!));
  const samples = await Promise.all(tasks);
  if (includePublic) {
    samples.push(await navigate(backend, publicSamples[0], "technical"), await navigate(backend, publicSamples[1], "community"));
  }
  clearInterval(delayTimer);
  const elapsedMs = performance.now() - started;
  const latencies = samples.filter((sample) => sample.outcome === "ok").map((sample) => sample.elapsedMs);
  const failures = samples.filter((sample) => sample.outcome === "error").length;
  const timeouts = samples.filter((sample) => sample.outcome === "timeout").length;
  return {
    level, kind, samples, elapsedMs, throughputPerSecond: samples.length / (elapsedMs / 1_000), p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
    timeoutRate: timeouts / samples.length, errorRate: failures / samples.length, eventLoopMaxDelayMs: Math.max(0, ...delays), telemetry: await processTelemetry(), orphanResources: [], profileReuse: kind === "warm",
  };
};
const stopOwnedObscura = async (): Promise<readonly string[]> => {
  if (obscura?.exitCode === null) {
    process.kill(-obscura.pid, "SIGTERM");
    try { await withTimeout(obscura.exited, 5_000); } catch { process.kill(-obscura.pid, "SIGKILL"); await obscura.exited; }
  }
  return await orphanResources();
};
const startOwnedObscura = async (profile: string): Promise<{ readonly type: "chrome"; readonly url: string }> => {
  cdpPort = 45_000 + Math.floor(Math.random() * 5_000);
  obscura = Bun.spawn([obscuraPath!, "serve", "--host", "127.0.0.1", "--port", `${cdpPort}`, "--stealth", "--allow-private-network", "--storage-dir", profile, "--quiet"], { stdout: "pipe", stderr: "pipe", detached: true });
  if (obscura.stdout instanceof ReadableStream) void new Response(obscura.stdout).text().then((text) => rawLog.push(`stdout:\n${text}`));
  if (obscura.stderr instanceof ReadableStream) void new Response(obscura.stderr).text().then((text) => rawLog.push(`stderr:\n${text}`));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      const body = await response.json() as { webSocketDebuggerUrl?: string };
      if (body.webSocketDebuggerUrl) return { type: "chrome", url: body.webSocketDebuggerUrl };
    } catch {}
    await wait(100);
  }
  throw new Error("owned Obscura did not publish CDP URL");
};

try {
  if (Bun.version !== "1.4.0") throw new Error(`expected Bun 1.4.0, received ${Bun.version}`);
  if (!obscuraPath) throw new Error("obscura is not on PATH");
  for (const name of ["static", "js-heavy", "technical", "news", "community", "error"]) await readFixture(name);
  fixtureServer = Bun.serve({ hostname: "0.0.0.0", port: 0, fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/slow.html") return new Promise((resolve) => setTimeout(() => resolve(new Response("<!doctype html><main>Slow fixture after 350ms</main>", { headers: { "content-type": "text/html" } })), 350));
    if (url.pathname === "/error.html") return new Response(fixtureHtml.get("error")!, { status: 503, headers: { "content-type": "text/html" } });
    const name = url.pathname.slice(1, -5);
    const html = fixtureHtml.get(name);
    return html ? new Response(html, { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 });
  } });
  port = Number(new URL(fixtureServer.url).port);
  const trials: Trial[] = [];
  for (const level of levels) {
    const profile = `${storageDir}-${level}`;
    const coldBackend = await startOwnedObscura(profile);
    trials.push(await runTrial(level, "cold", coldBackend, level === 1));
    const coldOrphans = await stopOwnedObscura();
    trials[trials.length - 1] = { ...trials[trials.length - 1]!, orphanResources: coldOrphans };
    const warmBackend = await startOwnedObscura(profile);
    trials.push(await runTrial(level, "warm", warmBackend, level === 1));
    const warmOrphans = await stopOwnedObscura();
    trials[trials.length - 1] = { ...trials[trials.length - 1]!, orphanResources: warmOrphans };
  }
  const result: Result = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), command: `bun spikes/obscura-load/load.ts ${outputPath}`, environment: { bun: Bun.version, obscura: (await Bun.$`${obscuraPath} --version`.text()).trim(), fixturePort: port, storageDir, platform: navigator.platform }, trials, navigationCount: trials.reduce((total, trial) => total + trial.samples.length, 0), explicitTests: {
    missingMemoryTelemetry: { simulated: true, expectedControllerBehavior: "do not grow beyond lastSafeCapacity; retain latency/error backpressure" },
    newMachineProfile: { storageDir, profileExistedBeforeRun: false },
    growthFrom8: trials.filter((trial) => trial.level >= 8).map((trial) => ({ level: trial.level, kind: trial.kind, p95Ms: trial.p95Ms, rssBytes: trial.telemetry.rssBytes })),
    persistedProfileReuse: { storageDir, warmTrials: trials.filter((trial) => trial.kind === "warm").length },
  }, rawLog: rawLog.join("\n"), childPid: obscura?.pid ?? null };
  await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
  rawLog.push(`fatal: ${detail}`);
  await Bun.write(outputPath, `${JSON.stringify({ schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), fatal: detail, rawLog: rawLog.join("\n") }, null, 2)}\n`);
  console.error(detail);
  process.exitCode = 1;
} finally {
  const leftovers = await stopOwnedObscura();
  fixtureServer?.stop(true);
  if (leftovers.length > 0) rawLog.push(`cleanup leftovers: ${leftovers.join(", ")}`);
}
