import { renameAtomically, type Workspace } from "@/features/configuration";
import {
  defaultObscuraTransport,
  type ObscuraTransport,
} from "@/features/rendering/adapters/obscura-transport";

export interface ObscuraArtifact {
  readonly version: string;
  readonly variant: "macos-arm64";
  readonly url: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly expectedFiles: readonly ("obscura" | "obscura-worker")[];
}

export interface ObscuraInstaller {
  install(artifact: ObscuraArtifact): Promise<string>;
  ensure(artifact: ObscuraArtifact): Promise<string>;
  activeVersion(): Promise<string | undefined>;
}

/** Installs only release-pinned Obscura artifacts into the private workspace. */
export function createObscuraInstaller(
  workspace: Workspace,
  probe: (executable: string) => Promise<boolean>,
  transport: ObscuraTransport = defaultObscuraTransport,
): ObscuraInstaller {
  const pending = new Map<string, Promise<string>>();
  const install = (artifact: ObscuraArtifact): Promise<string> => {
    const current =
      pending.get(artifact.version) ?? installOne(workspace, artifact, probe, transport);
    pending.set(artifact.version, current);
    return current.finally(() => pending.delete(artifact.version));
  };
  return { install, ensure: install, activeVersion: () => activeVersion(workspace) };
}

async function installOne(
  workspace: Workspace,
  artifact: ObscuraArtifact,
  probe: (executable: string) => Promise<boolean>,
  transport: ObscuraTransport,
): Promise<string> {
  validatePin(artifact);
  const base = `${workspace.root}/bin/obscura`;
  const target = `${base}/${artifact.version}`;
  await createDirectory(base);
  restrictDirectory(base);
  await acquireLock(`${base}/.${artifact.version}.lock`);
  try {
    if (await isHealthyInstall(target, artifact)) return target;
    return await stageAndActivate(base, target, artifact, probe, transport);
  } finally {
    removeDirectory(`${base}/.${artifact.version}.lock`);
  }
}

async function stageAndActivate(
  base: string,
  target: string,
  artifact: ObscuraArtifact,
  probe: (executable: string) => Promise<boolean>,
  transport: ObscuraTransport,
): Promise<string> {
  const stage = `${base}/.${artifact.version}.installing`;
  const archive = `${base}/.${artifact.version}.download`;
  removeDirectory(stage);
  removeFile(archive);
  await createDirectory(stage);
  restrictDirectory(stage);
  try {
    await transport.download(new URL(artifact.url), archive, artifact.sizeBytes);
    await verifyArchive(archive, artifact, transport);
    await transport.extract(archive, stage, artifact.sizeBytes);
    await verifyExtracted(stage, artifact);
    if (!(await probe(`${stage}/obscura`))) throw new Error("obscura_probe_failed");
    await writeManifest(stage, artifact);
    renameAtomically(stage, target);
    await writeActive(base, artifact);
    return target;
  } catch (error) {
    removeDirectory(stage);
    throw error;
  } finally {
    removeFile(archive);
  }
}

function validatePin(artifact: ObscuraArtifact): void {
  if (!/^[0-9A-Za-z._-]+$/u.test(artifact.version)) throw new Error("obscura_invalid_release_pin");
  if (artifact.variant !== "macos-arm64") throw new Error("obscura_invalid_release_variant");
  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 1)
    throw new Error("obscura_invalid_archive_limit");
  if (!/^[a-f0-9]{64}$/u.test(artifact.sha256)) throw new Error("obscura_invalid_release_hash");
  const url = new URL(artifact.url);
  if (url.protocol !== "https:") throw new Error("obscura_release_requires_https");
  if (
    !artifact.expectedFiles.includes("obscura") ||
    !artifact.expectedFiles.includes("obscura-worker")
  )
    throw new Error("obscura_archive_missing_required_files");
}

async function verifyArchive(
  archive: string,
  artifact: ObscuraArtifact,
  transport: ObscuraTransport,
): Promise<void> {
  const size = Bun.file(archive).size ?? 0;
  if (size > artifact.sizeBytes) throw new Error("obscura_download_too_large");
  if ((await digestFile(archive)) !== artifact.sha256) throw new Error("obscura_sha256_mismatch");
  const entries = await transport.list(archive);
  if (entries.some((entry) => !safeEntry(entry))) throw new Error("obscura_archive_unsafe_entry");
  if (!sameFiles(entries, artifact.expectedFiles))
    throw new Error("obscura_archive_unexpected_files");
}

function safeEntry(entry: { readonly path: string; readonly kind: "file" | "directory" }): boolean {
  return (
    entry.kind === "file" &&
    !entry.path.startsWith("/") &&
    !entry.path.split("/").some((part) => part === ".." || part.length === 0) &&
    (entry.path === "obscura" || entry.path === "obscura-worker")
  );
}

function sameFiles(
  entries: readonly { readonly path: string }[],
  expected: readonly ("obscura" | "obscura-worker")[],
): boolean {
  const actual = entries.map((entry) => entry.path).sort();
  return (
    actual.length === expected.length &&
    actual.every((entry, index) => entry === [...expected].sort()[index])
  );
}

async function verifyExtracted(stage: string, artifact: ObscuraArtifact): Promise<void> {
  for (const file of artifact.expectedFiles) {
    if (isLink(`${stage}/${file}`) || !(await Bun.file(`${stage}/${file}`).exists()))
      throw new Error("obscura_extraction_invalid");
    restrictExecutable(`${stage}/${file}`);
  }
}

async function isHealthyInstall(target: string, artifact: ObscuraArtifact): Promise<boolean> {
  if (isLink(target) || !(await Bun.file(`${target}/manifest.toml`).exists())) return false;
  const manifest = await Bun.file(`${target}/manifest.toml`).text();
  return (
    manifest.includes(`version = ${JSON.stringify(artifact.version)}`) &&
    !isLink(`${target}/obscura`)
  );
}

async function writeManifest(directory: string, artifact: ObscuraArtifact): Promise<void> {
  await Bun.write(
    `${directory}/manifest.toml`,
    `version = ${JSON.stringify(artifact.version)}\nvariant = ${JSON.stringify(artifact.variant)}\nsha256 = ${JSON.stringify(artifact.sha256)}\n`,
  );
}

async function writeActive(base: string, artifact: ObscuraArtifact): Promise<void> {
  const temporary = `${base}/.current.tmp`;
  await Bun.write(
    temporary,
    `version = ${JSON.stringify(artifact.version)}\nvariant = ${JSON.stringify(artifact.variant)}\n`,
  );
  renameAtomically(temporary, `${base}/current.toml`);
}

async function activeVersion(workspace: Workspace): Promise<string | undefined> {
  const file = Bun.file(`${workspace.root}/bin/obscura/current.toml`);
  if (isLink(`${workspace.root}/bin/obscura/current.toml`) || !(await file.exists()))
    return undefined;
  const parsed = Bun.TOML.parse(await file.text());
  return isVersionManifest(parsed) ? parsed.version : undefined;
}

function isVersionManifest(value: unknown): value is { readonly version: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string"
  );
}

async function acquireLock(lock: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (Bun.spawnSync(["/bin/mkdir", lock]).exitCode === 0) return;
    await Bun.sleep(10);
  }
  throw new Error("obscura_install_lock_timeout");
}

async function createDirectory(path: string): Promise<void> {
  if (Bun.spawnSync(["/bin/mkdir", "-p", path]).exitCode !== 0)
    throw new Error("obscura_install_directory_failed");
}

function removeDirectory(path: string): void {
  Bun.spawnSync(["/bin/rm", "-rf", path]);
}

function removeFile(path: string): void {
  Bun.spawnSync(["/bin/rm", "-f", path]);
}

function restrictDirectory(path: string): void {
  if (Bun.spawnSync(["/bin/chmod", "700", path]).exitCode !== 0)
    throw new Error("obscura_permission_setup_failed");
}

function restrictExecutable(path: string): void {
  if (Bun.spawnSync(["/bin/chmod", "700", path]).exitCode !== 0)
    throw new Error("obscura_permission_setup_failed");
}

function isLink(path: string): boolean {
  return Bun.spawnSync(["/bin/test", "-L", path]).exitCode === 0;
}

async function digestFile(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}
