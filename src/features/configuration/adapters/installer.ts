import { renameAtomically, type Workspace } from "@/features/configuration/adapters/workspace";
import { isRecord } from "@/features/configuration/domain/configuration";

export interface ObscuraArtifact {
  readonly version: string;
  readonly sha256: string;
  readonly executable: Uint8Array;
}
export interface ObscuraInstaller {
  install(artifact: ObscuraArtifact): Promise<string>;
  activeVersion(): Promise<string | undefined>;
}

export function createObscuraInstaller(
  workspace: Workspace,
  probe: (executable: string) => Promise<boolean>,
): ObscuraInstaller {
  const pending = new Map<string, Promise<string>>();
  function install(artifact: ObscuraArtifact): Promise<string> {
    const current = pending.get(artifact.version) ?? installOne(workspace, artifact, probe);
    pending.set(artifact.version, current);
    return current.finally(() => pending.delete(artifact.version));
  }
  return { install, activeVersion: () => activeVersion(workspace) };
}

async function installOne(
  workspace: Workspace,
  artifact: ObscuraArtifact,
  probe: (path: string) => Promise<boolean>,
): Promise<string> {
  if ((await digest(artifact.executable)) !== artifact.sha256)
    throw new Error("obscura_sha256_mismatch");
  const base = `${workspace.root}/bin/obscura`;
  const target = `${base}/${artifact.version}`;
  if (await Bun.file(`${target}/obscura`).exists()) return target;
  const temporary = `${base}/.${artifact.version}.tmp`;
  const mkdir = Bun.spawnSync(["/bin/mkdir", "-p", temporary]);
  if (mkdir.exitCode !== 0) throw new Error("obscura_install_directory_failed");
  const executable = `${temporary}/obscura`;
  await Bun.write(executable, artifact.executable);
  if (!(await probe(executable))) {
    Bun.spawnSync(["/bin/rm", "-rf", temporary]);
    throw new Error("obscura_probe_failed");
  }
  renameAtomically(temporary, target);
  await writeActive(base, artifact.version);
  return target;
}

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
