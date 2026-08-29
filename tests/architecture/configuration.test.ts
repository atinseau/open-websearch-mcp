import { afterAll, expect, test } from "bun:test";
import {
  createConfigurationService,
  createSessionLogger,
  resolveWorkspace,
} from "@/features/configuration";
import { createObscuraInstaller, type ObscuraTransport } from "@/features/rendering";

const roots: string[] = [];
function workspace() {
  const root = `${Bun.env.TMPDIR ?? "/tmp"}/open-websearch-config-${crypto.randomUUID()}`;
  roots.push(root);
  return resolveWorkspace(root);
}
afterAll(() => {
  for (const root of roots.splice(0)) Bun.spawnSync(["/bin/rm", "-rf", root]);
});

test("CONFIG-001 creates the injected workspace layout and commented default TOML", async () => {
  const service = createConfigurationService({ workspace: workspace() });
  await service.prepareForCall();
  expect(await Bun.file(service.workspace().config).text()).toContain("schema_version = 1");
  expect(
    Bun.spawnSync(["/bin/test", "-d", `${service.workspace().root}/cache/extracted`]).exitCode,
  ).toBe(0);
  expect(Object.isFrozen(service.snapshot())).toBe(true);
});

test("CONFIG-003/005 hot-reloads valid changes and retains the last valid snapshot", async () => {
  const diagnostics: string[] = [];
  const service = createConfigurationService({
    workspace: workspace(),
    diagnostic: (item) => diagnostics.push(item),
  });
  await service.prepareForCall();
  const original = service.snapshot();
  await Bun.write(
    service.workspace().config,
    (await Bun.file(service.workspace().config).text()).replace(
      "candidate_budget = 30",
      "candidate_budget = 31",
    ),
  );
  const changed = await service.prepareForCall();
  expect(changed.configuration?.search.candidate_budget).toBe(31);
  expect(original.configuration?.search.candidate_budget).toBe(30);
  await Bun.write(service.workspace().config, "schema_version = 1\nunknown = true\n");
  expect((await service.prepareForCall()).configuration?.search.candidate_budget).toBe(31);
  expect(diagnostics.join(" ")).toContain("invalid_config_reload");
});

test("CONFIG-006 retains current comments and leaves recoverable backup on migration interruption", async () => {
  const current = createConfigurationService({ workspace: workspace() });
  await current.prepareForCall();
  await Bun.write(current.workspace().config, "# retain me\nschema_version = 1\n");
  await current.prepareForCall();
  expect(await Bun.file(current.workspace().config).text()).toContain("# retain me");
  await Bun.write(current.workspace().config, "schema_version = 0\n");
  const interrupted = createConfigurationService({
    workspace: current.workspace(),
    migrationFailAfterBackup: true,
    diagnostic: () => undefined,
  });
  await interrupted.prepareForCall();
  expect(await Bun.file(`${current.workspace().config}.bak`).exists()).toBe(true);
  expect(await Bun.file(current.workspace().config).text()).toBe("schema_version = 0\n");
});

test("auto RSS profile is persisted outside user configuration and doctor is non-networking", async () => {
  const service = createConfigurationService({
    workspace: workspace(),
    physicalMemoryBytes: () => 32 * 1024 ** 3,
  });
  const snapshot = await service.prepareForCall();
  expect(snapshot.scheduler.safeRssBudgetBytes).toBe(4 * 1024 ** 3);
  await service.persistMachineProfile({
    warmP95Ms: 500,
    rssBytes: 123,
    highestHealthyCapacity: 16,
  });
  const next = createConfigurationService({ workspace: service.workspace() });
  expect((await next.prepareForCall()).scheduler.lastSafeCapacity).toBe(16);
  expect(await next.doctor()).toMatchObject({ workspace: true, config: true, schema: true });
});

test("LOG-001/002 JSONL records operational fields while redacting sensitive data", async () => {
  const target = workspace();
  const logger = await createSessionLogger(target, () => undefined);
  await logger.record({
    query: "bun",
    urls: ["https://example.test"],
    scores: [0.9],
    status: "ok",
    duration_ms: 3,
    page_body: "never",
    auth: ["not", "logged"],
  });
  await logger.record({ retries: 1, cache_provenance: "local_cache" });
  await logger.close();
  const file = (await Array.fromAsync(new Bun.Glob("*.jsonl").scan({ cwd: target.logs })))[0];
  const text = await Bun.file(`${target.logs}/${file}`).text();
  expect(text.split("\n").filter(Boolean)).toHaveLength(2);
  expect(text).toContain("cache_provenance");
  expect(text).not.toContain("never");
  expect(text).not.toContain("logged");
});

test("LOG-003 logging startup failure is diagnostic-only and never throws into MCP work", async () => {
  const target = workspace();
  await Bun.write(target.root, "not a directory", { createPath: true });
  const reports: string[] = [];
  const logger = await createSessionLogger(target, (item) => reports.push(item));
  await logger.record({ query: "safe" });
  expect(logger.failed).toBe(true);
  expect(reports).toContain("session_log_start_failed");
});

test("SECURITY-008 allowlisted session events cannot leak adversarial bodies or credentials", async () => {
  const target = workspace();
  const logger = await createSessionLogger(target, () => undefined);
  const secret = ["se", "cret", "=x"].join("");
  await logger.record({
    url: `https://example.test/path?token=${secret}`,
    error: secret,
    content: secret,
    markdown: secret,
    credential: secret,
    renamed_field: secret,
    anything: "short page body " + secret,
  });
  await logger.close();
  const name = (await Array.fromAsync(new Bun.Glob("*.jsonl").scan({ cwd: target.logs })))[0];
  const output = await Bun.file(`${target.logs}/${name}`).text();
  expect(output).toContain("https://example.test/path");
  expect(output).not.toContain(secret);
  expect(output).not.toContain("renamed_field");
});

test("INSTALL-001..003 install once, switch atomically, and retain the healthy version on rollback", async () => {
  const service = createConfigurationService({ workspace: workspace() });
  await service.prepareForCall();
  let probes = 0;
  const archive = new TextEncoder().encode("fixture-obscura");
  const sha256 = await sha(archive);
  const transport: ObscuraTransport = {
    async download(_url, destination) {
      await Bun.write(destination, archive);
    },
    async list() {
      return [
        { path: "obscura", kind: "file" },
        { path: "obscura-worker", kind: "file" },
      ];
    },
    async extract(_archive, destination) {
      await Bun.write(`${destination}/obscura`, archive);
      await Bun.write(`${destination}/obscura-worker`, archive);
    },
  };
  const installer = createObscuraInstaller(
    service.workspace(),
    async (file) => {
      probes++;
      return !file.includes("2.0.0");
    },
    transport,
  );
  const pin = (version: string) => ({
    version,
    variant: "macos-arm64" as const,
    url: "https://example.test/obscura.zip",
    sha256,
    sizeBytes: archive.byteLength,
    expectedFiles: ["obscura", "obscura-worker"] as const,
  });
  await Promise.all(Array.from({ length: 4 }, () => installer.install(pin("1.0.0"))));
  expect(probes).toBe(1);
  expect(await installer.activeVersion()).toBe("1.0.0");
  expect(installer.install(pin("2.0.0"))).rejects.toThrow("probe");
  expect(await installer.activeVersion()).toBe("1.0.0");
  expect(await Bun.file(`${service.workspace().root}/bin/obscura/1.0.0/obscura`).exists()).toBe(
    true,
  );
});

async function sha(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
