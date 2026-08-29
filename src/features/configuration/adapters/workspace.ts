import type { Workspace } from "@/features/configuration";

export const workspaceDirectories = [
  "bin/obscura",
  "cache/blobs",
  "cache/rendered",
  "cache/extracted",
  "investigations",
  "benchmarks",
  "profiles",
  "logs",
] as const;

export function resolveWorkspace(root = `${Bun.env.HOME ?? "."}/.open-websearch-mcp`): Workspace {
  return {
    root,
    config: `${root}/config.toml`,
    profile: `${root}/profiles/machine.toml`,
    logs: `${root}/logs`,
  };
}

export function ensureWorkspace(workspace: Workspace): void {
  const paths = [
    workspace.root,
    ...workspaceDirectories.map((directory) => `${workspace.root}/${directory}`),
  ];
  const outcome = Bun.spawnSync(["/bin/mkdir", "-p", ...paths]);
  if (outcome.exitCode !== 0) throw new Error("workspace_directory_creation_failed");
}

export function renameAtomically(from: string, to: string): void {
  const outcome = Bun.spawnSync(["/bin/mv", "-f", from, to]);
  if (outcome.exitCode !== 0) throw new Error("atomic_rename_failed");
}
