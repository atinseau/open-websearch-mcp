import { afterAll, expect, test } from "bun:test";
import { createObscuraInstaller, type ObscuraTransport } from "@/features/rendering";
import { resolveWorkspace, type Workspace } from "@/features/configuration";

const roots: string[] = [];
const archive = new TextEncoder().encode("signed fixture archive");
const archiveHash = await sha(archive);

function workspace(): Workspace {
  const root = `${Bun.env.TMPDIR ?? "/tmp"}/open-websearch-installer-${crypto.randomUUID()}`;
  roots.push(root);
  return resolveWorkspace(root);
}

function pin(version = "0.2.1", hash = archiveHash, bytes = archive.byteLength) {
  return {
    version,
    variant: "macos-arm64" as const,
    url: "https://releases.example.test/obscura-0.2.1.zip",
    sha256: hash,
    sizeBytes: bytes,
    expectedFiles: ["obscura", "obscura-worker"] as const,
  };
}

function transport(
  options: {
    readonly bytes?: Uint8Array;
    readonly entries?: readonly { readonly path: string; readonly kind: "file" | "directory" }[];
    readonly onDownload?: () => Promise<void> | void;
  } = {},
): ObscuraTransport {
  const bytes = options.bytes ?? archive;
  return {
    async download(_url, destination) {
      await options.onDownload?.();
      await Bun.write(destination, bytes);
    },
    async list() {
      return (
        options.entries ?? [
          { path: "obscura", kind: "file" as const },
          { path: "obscura-worker", kind: "file" as const },
        ]
      );
    },
    async extract(_archive, destination) {
      await Bun.write(`${destination}/obscura`, archive);
      await Bun.write(`${destination}/obscura-worker`, archive);
    },
  };
}

afterAll(() => {
  for (const root of roots.splice(0)) Bun.spawnSync(["/bin/rm", "-rf", root]);
});

test("INSTALL-002 fresh install records a pinned manifest and preserves both executables", async () => {
  const target = workspace();
  const installer = createObscuraInstaller(target, async () => true, transport());
  expect(installer.install(pin())).resolves.toBe(`${target.root}/bin/obscura/0.2.1`);
  expect(await installer.activeVersion()).toBe("0.2.1");
  expect(await Bun.file(`${target.root}/bin/obscura/0.2.1/obscura-worker`).exists()).toBe(true);
  expect(await Bun.file(`${target.root}/bin/obscura/0.2.1/manifest.toml`).text()).toContain(
    'variant = "macos-arm64"',
  );
});

test("INSTALL-001 concurrent first calls share one in-process installation", async () => {
  let downloads = 0;
  const installer = createObscuraInstaller(
    workspace(),
    async () => true,
    transport({
      onDownload: () => {
        downloads++;
      },
    }),
  );
  await Promise.all(Array.from({ length: 8 }, () => installer.ensure(pin())));
  expect(downloads).toBe(1);
});

test("INSTALL-002 rejects a corrupt archive before extraction", async () => {
  const installer = createObscuraInstaller(
    workspace(),
    async () => true,
    transport({ bytes: new Uint8Array([1]) }),
  );
  expect(installer.install(pin())).rejects.toThrow("sha256");
});

test("INSTALL-002 rejects a download over its explicit limit", async () => {
  const bytes = new Uint8Array(archive.byteLength + 1);
  const installer = createObscuraInstaller(workspace(), async () => true, transport({ bytes }));
  expect(installer.install(pin("0.2.1", await sha(bytes), archive.byteLength))).rejects.toThrow(
    "too_large",
  );
});

test("SECURITY-009 rejects archive traversal during the safe listing phase", async () => {
  const installer = createObscuraInstaller(
    workspace(),
    async () => true,
    transport({
      entries: [
        { path: "obscura", kind: "file" },
        { path: "../obscura-worker", kind: "file" },
      ],
    }),
  );
  expect(installer.install(pin())).rejects.toThrow("unsafe_entry");
});

test("INSTALL-003 failed smoke test does not promote the staged version", async () => {
  const target = workspace();
  const installer = createObscuraInstaller(
    target,
    async (executable) => !executable.includes("0.2.2"),
    transport(),
  );
  await installer.install(pin("0.2.1"));
  expect(installer.install(pin("0.2.2"))).rejects.toThrow("probe_failed");
  expect(await installer.activeVersion()).toBe("0.2.1");
  expect(await Bun.file(`${target.root}/bin/obscura/0.2.2`).exists()).toBe(false);
});

test("INSTALL-003 upgrades side-by-side while retaining the rollback version", async () => {
  const target = workspace();
  const installer = createObscuraInstaller(target, async () => true, transport());
  await installer.install(pin("0.2.1"));
  await installer.install(pin("0.2.2"));
  expect(await installer.activeVersion()).toBe("0.2.2");
  expect(await Bun.file(`${target.root}/bin/obscura/0.2.1/obscura`).exists()).toBe(true);
  expect(await Bun.file(`${target.root}/bin/obscura/0.2.2/obscura`).exists()).toBe(true);
});

test("INSTALL-002 removes an interrupted stage and recovers on the next request", async () => {
  const target = workspace();
  const stage = `${target.root}/bin/obscura/.0.2.1.installing`;
  Bun.spawnSync(["/bin/mkdir", "-p", stage]);
  await Bun.write(`${stage}/partial`, "never promoted");
  const installer = createObscuraInstaller(target, async () => true, transport());
  await installer.install(pin());
  expect(await Bun.file(`${stage}/partial`).exists()).toBe(false);
  expect(await installer.activeVersion()).toBe("0.2.1");
});

test("INSTALL-001 concurrent processes coalesce through the workspace lock", async () => {
  const target = workspace();
  const count = `${target.root}/downloads`;
  const child = installerChild(target.root, count, archiveHash);
  const first = Bun.spawn(["bun", "-e", child], { cwd: import.meta.dir });
  const second = Bun.spawn(["bun", "-e", child], { cwd: import.meta.dir });
  expect(await first.exited).toBe(0);
  expect(await second.exited).toBe(0);
  expect((await Bun.file(count).text()).split("\n").filter(Boolean)).toHaveLength(1);
});

function installerChild(root: string, count: string, hash: string): string {
  const installer = new URL("../../src/features/rendering/index.ts", import.meta.url).pathname;
  const configuration = new URL("../../src/features/configuration/index.ts", import.meta.url)
    .pathname;
  return `
    import { createObscuraInstaller } from ${JSON.stringify(installer)};
    import { resolveWorkspace } from ${JSON.stringify(configuration)};
    const bytes = new TextEncoder().encode("signed fixture archive");
    const instance = createObscuraInstaller(resolveWorkspace(${JSON.stringify(root)}), async () => true, {
      async download(_url, destination) {
        const counter = Bun.file(${JSON.stringify(count)});
        await Bun.write(${JSON.stringify(count)}, (await counter.exists() ? await counter.text() : "") + "download\\n", { createPath: true });
        await Bun.sleep(100);
        await Bun.write(destination, bytes);
      },
      async list() { return [{ path: "obscura", kind: "file" }, { path: "obscura-worker", kind: "file" }]; },
      async extract(_archive, destination) {
        await Bun.write(destination + "/obscura", bytes);
        await Bun.write(destination + "/obscura-worker", bytes);
      },
    });
    await instance.install({ version: "0.2.1", variant: "macos-arm64", url: "https://releases.example.test/obscura.zip", sha256: ${JSON.stringify(hash)}, sizeBytes: bytes.byteLength, expectedFiles: ["obscura", "obscura-worker"] });
  `;
}

async function sha(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array([...bytes]));
  return [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, "0")).join("");
}
