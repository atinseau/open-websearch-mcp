import { renameAtomically } from "@/features/configuration/adapters/workspace";
import type { Workspace } from "@/features/configuration";
import { isRecord } from "@/features/configuration/domain/configuration";

export interface ObscuraArtifact {
  readonly version: string;
  readonly sha256: string;
  readonly executable?: Uint8Array;
  readonly url?: string;
  readonly sizeBytes?: number;
}
export interface ObscuraTransport {
  download(url: URL, maximumBytes: number): Promise<Uint8Array>;
  inspect(archive: Uint8Array): Promise<Uint8Array>;
}
export interface ObscuraInstaller {
  install(artifact: ObscuraArtifact): Promise<string>;
  ensure(artifact: ObscuraArtifact): Promise<string>;
  activeVersion(): Promise<string | undefined>;
}

export function createObscuraInstaller(
  workspace: Workspace,
  probe: (executable: string) => Promise<boolean>,
  transport: ObscuraTransport = httpsTransport,
): ObscuraInstaller {
  const pending = new Map<string, Promise<string>>();
  function install(artifact: ObscuraArtifact): Promise<string> {
    const current =
      pending.get(artifact.version) ?? installOne(workspace, artifact, probe, transport);
    pending.set(artifact.version, current);
    return current.finally(() => pending.delete(artifact.version));
  }
  return { install, ensure: install, activeVersion: () => activeVersion(workspace) };
}

async function installOne(
  workspace: Workspace,
  artifact: ObscuraArtifact,
  probe: (path: string) => Promise<boolean>,
  transport: ObscuraTransport,
): Promise<string> {
  if (!artifact.version || !/^[0-9A-Za-z._-]+$/u.test(artifact.version))
    throw new Error("obscura_invalid_release_pin");
  const archive = await artifactBytes(artifact, transport);
  if ((await digest(archive)) !== artifact.sha256) throw new Error("obscura_sha256_mismatch");
  const base = `${workspace.root}/bin/obscura`;
  const target = `${base}/${artifact.version}`;
  if (await Bun.file(`${target}/obscura`).exists()) return target;
  const lock = `${base}/.${artifact.version}.lock`;
  await acquireLock(lock);
  const temporary = `${base}/.${artifact.version}.tmp`;
  const mkdir = Bun.spawnSync(["/bin/mkdir", "-p", temporary]);
  if (mkdir.exitCode !== 0) throw new Error("obscura_install_directory_failed");
  try {
    const executable = `${temporary}/obscura`;
    await Bun.write(executable, await transport.inspect(archive));
    if (!(await probe(executable))) throw new Error("obscura_probe_failed");
    renameAtomically(temporary, target);
    await writeActive(base, artifact.version);
    return target;
  } catch (error) {
    Bun.spawnSync(["/bin/rm", "-rf", temporary]);
    throw error;
  } finally {
    Bun.spawnSync(["/bin/rmdir", lock]);
  }
}

async function artifactBytes(
  artifact: ObscuraArtifact,
  transport: ObscuraTransport,
): Promise<Uint8Array> {
  if (artifact.executable) return artifact.executable;
  if (!artifact.url) throw new Error("obscura_release_missing_url");
  const url = new URL(artifact.url);
  if (url.protocol !== "https:") throw new Error("obscura_release_requires_https");
  return transport.download(url, artifact.sizeBytes ?? 100 * 1024 * 1024);
}

async function acquireLock(lock: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (Bun.spawnSync(["/bin/mkdir", lock]).exitCode === 0) return;
    await Bun.sleep(10);
  }
  throw new Error("obscura_install_lock_timeout");
}

const httpsTransport: ObscuraTransport = {
  async download(url, maximumBytes) {
    const response = await fetch(url, { redirect: "error" });
    if (!response.ok || !response.body) throw new Error("obscura_download_failed");
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maximumBytes) throw new Error("obscura_download_too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw new Error("obscura_download_too_large");
    return bytes;
  },
  async inspect(archive) {
    // Release artifacts currently contain exactly the signed executable. Refuse archive-like payloads
    // until a format-specific extractor validates entries and paths.
    if (archive.subarray(0, 2).every((byte, index) => byte === [0x50, 0x4b][index]))
      throw new Error("obscura_archive_requires_inspection");
    return archive;
  },
};

async function activeVersion(workspace: Workspace): Promise<string | undefined> {
  const file = Bun.file(`${workspace.root}/bin/obscura/current.toml`);
  if (!(await file.exists())) return undefined;
  const parsed = Bun.TOML.parse(await file.text());
  return isRecord(parsed) && typeof parsed.version === "string" ? parsed.version : undefined;
}

async function writeActive(base: string, version: string): Promise<void> {
  const temporary = `${base}/.current.tmp`;
  await Bun.write(temporary, `version = ${JSON.stringify(version)}\n`);
  renameAtomically(temporary, `${base}/current.toml`);
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, "0")).join("");
}
