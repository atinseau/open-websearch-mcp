import { isRecord, run } from "./process-utils.ts";

type LockOwner = { pid: number; token: string; candidate?: string; started_at: string };

export async function readLock(path: string): Promise<LockOwner | undefined> {
  const value: unknown = await Bun.file(path)
    .json()
    .catch(() => undefined);
  if (
    !isRecord(value) ||
    typeof value.pid !== "number" ||
    typeof value.token !== "string" ||
    (value.candidate !== undefined && typeof value.candidate !== "string") ||
    typeof value.started_at !== "string"
  ) {
    return undefined;
  }
  return {
    pid: value.pid,
    token: value.token,
    started_at: value.started_at,
    ...(typeof value.candidate === "string" ? { candidate: value.candidate } : {}),
  };
}

type LockPaths = {
  readonly repository: string;
  readonly lockRoot: string;
  readonly lock: string;
  readonly recovery: string;
  readonly candidate: string;
  readonly token: string;
};

/** A lock file older than this with no live owner is treated as abandoned. */
const staleLockSeconds = 30;
const retryDelayMs = 20;

function lockPaths(repository: string): LockPaths {
  const lockRoot = `${repository}/.worktree`;
  const token = crypto.randomUUID();
  return {
    repository,
    lockRoot,
    lock: `${lockRoot}/.controller-lock`,
    recovery: `${lockRoot}/.controller-lock-recovery`,
    candidate: `${lockRoot}/.controller-owner-${process.pid}-${token}.json`,
    token,
  };
}

async function processIsAlive(pid: number): Promise<boolean> {
  const probe = Bun.spawn(["kill", "-0", String(pid)], { stdout: "ignore", stderr: "ignore" });
  return (await probe.exited) === 0;
}

async function writtenRecently(path: string, repository: string): Promise<boolean> {
  const modifiedAt = Number(await run(["stat", "-f", "%m", path], repository));
  return Date.now() / 1_000 - modifiedAt < staleLockSeconds;
}

async function remove(path: string, repository: string): Promise<void> {
  await run(["rm", path], repository).catch(() => undefined);
}

async function removeOwnedCandidate(owner: LockOwner | undefined, paths: LockPaths): Promise<void> {
  if (!owner?.candidate?.startsWith(`${paths.lockRoot}/.controller-owner-`)) return;
  await remove(owner.candidate, paths.repository);
}

function releaseHandle(paths: LockPaths): () => Promise<void> {
  return async () => {
    const held = await readLock(paths.lock);
    if (held?.token === paths.token) await remove(paths.lock, paths.repository);
    await remove(paths.candidate, paths.repository);
  };
}

/** Clears an abandoned recovery marker; returns true when the caller should retry. */
async function clearRecoveryMarker(paths: LockPaths): Promise<boolean> {
  const owner = await readLock(paths.recovery);
  if (
    owner?.pid
      ? await processIsAlive(owner.pid)
      : await writtenRecently(paths.recovery, paths.repository)
  ) {
    await Bun.sleep(retryDelayMs);
    return true;
  }
  await remove(paths.recovery, paths.repository);
  await removeOwnedCandidate(owner, paths);
  return true;
}

/** Throws when a live or freshly written lock proves another controller owns it. */
async function assertLockIsAbandoned(
  current: LockOwner | undefined,
  paths: LockPaths,
): Promise<void> {
  const contended =
    !current?.pid || !current.token
      ? await writtenRecently(paths.lock, paths.repository)
      : await processIsAlive(current.pid);
  if (!contended) return;
  await remove(paths.candidate, paths.repository);
  throw new Error(
    !current?.pid || !current.token
      ? "Another controller is acquiring the lock"
      : "Another controller is already running",
  );
}

/** Replaces a lock proven stale; returns the release handle when it succeeds. */
async function stealStaleLock(
  current: LockOwner | undefined,
  paths: LockPaths,
): Promise<(() => Promise<void>) | undefined> {
  try {
    const stale = await readLock(paths.lock);
    if (stale?.token !== current?.token && (stale || current)) return undefined;
    await remove(paths.lock, paths.repository);
    await removeOwnedCandidate(stale, paths);
    await run(["ln", paths.candidate, paths.lock], paths.repository);
    return releaseHandle(paths);
  } finally {
    await remove(paths.recovery, paths.repository);
  }
}

async function attemptAcquire(paths: LockPaths): Promise<(() => Promise<void>) | undefined> {
  if (await Bun.file(paths.recovery).exists()) {
    await clearRecoveryMarker(paths);
    return undefined;
  }
  try {
    await run(["ln", paths.candidate, paths.lock], paths.repository);
    return releaseHandle(paths);
  } catch {
    const current = await readLock(paths.lock);
    await assertLockIsAbandoned(current, paths);
    try {
      await run(["ln", paths.candidate, paths.recovery], paths.repository);
    } catch {
      await Bun.sleep(retryDelayMs);
      return undefined;
    }
    return await stealStaleLock(current, paths);
  }
}

export async function acquireControllerLock(repository: string): Promise<() => Promise<void>> {
  const paths = lockPaths(repository);
  const owner: LockOwner = {
    pid: process.pid,
    token: paths.token,
    candidate: paths.candidate,
    started_at: new Date().toISOString(),
  };
  await run(["mkdir", "-p", paths.lockRoot], repository);
  await Bun.write(paths.candidate, JSON.stringify(owner));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const release = await attemptAcquire(paths);
    if (release) return release;
  }
  await remove(paths.candidate, repository);
  throw new Error("Could not acquire controller lock");
}
