import { requiredDate } from "./contract-json.ts";
import { runProcess } from "./process-controls.ts";

async function execute(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await runProcess(args, {
    timeoutMs: 30_000,
    maxOutputBytes: 1_048_576,
  });
  return {
    exitCode: result.failure === undefined ? result.exit_code : -1,
    stdout: result.stdout,
    stderr: result.failure ?? result.stderr,
  };
}

interface LockOwner {
  pid: number;
  token: string;
  process_start: string;
  acquired_at: string;
}

function lockOwner(value: unknown): LockOwner {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("refresh lock owner must be an object");
  }
  const candidate: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) candidate[key] = entry;
  if (
    typeof candidate.pid !== "number" ||
    typeof candidate.token !== "string" ||
    typeof candidate.process_start !== "string" ||
    typeof candidate.acquired_at !== "string" ||
    !Number.isFinite(Date.parse(candidate.acquired_at))
  ) {
    throw new Error("refresh lock owner metadata is invalid");
  }
  return {
    pid: candidate.pid,
    token: candidate.token,
    process_start: candidate.process_start,
    acquired_at: candidate.acquired_at,
  };
}

async function processStart(pid: number): Promise<string | undefined> {
  const result = await execute(["/bin/ps", "-o", "lstart=", "-p", String(pid)]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

async function ownerIsActive(owner: LockOwner): Promise<boolean> {
  const alive = await execute(["/bin/kill", "-0", String(owner.pid)]);
  return alive.exitCode === 0 && (await processStart(owner.pid)) === owner.process_start;
}

async function remove(path: string): Promise<void> {
  const result = await execute(["/bin/rm", "-f", path]);
  if (result.exitCode !== 0) throw new Error(`failed to remove ${path}: ${result.stderr}`);
}

async function linkOwner(owner: LockOwner, target: string): Promise<boolean> {
  const candidate = `${target}.${owner.token}.candidate`;
  try {
    await Bun.write(candidate, `${JSON.stringify(owner)}\n`);
    const linked = await execute(["/bin/ln", candidate, target]);
    return linked.exitCode === 0;
  } finally {
    await remove(candidate);
  }
}

async function removeAbandonedCandidates(root: string, lockName: string): Promise<void> {
  const glob = new Bun.Glob(`${lockName}.*.candidate`);
  for await (const name of glob.scan({ cwd: root, onlyFiles: true })) {
    const path = `${root}/${name}`;
    try {
      const owner = lockOwner(await Bun.file(path).json());
      if (!(await ownerIsActive(owner))) await remove(path);
    } catch {
      await remove(path);
    }
  }
}

async function acquireLock(lock: string): Promise<LockOwner> {
  const currentProcessStart = await processStart(process.pid);
  if (currentProcessStart === undefined) throw new Error("failed to identify refresh lock owner");
  const owner: LockOwner = {
    pid: process.pid,
    token: crypto.randomUUID(),
    process_start: currentProcessStart,
    acquired_at: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const acquired = await tryAcquireLock(lock, owner);
    if (acquired) return owner;
  }
  throw new Error(`failed to recover refresh lock: ${lock}`);
}

async function tryAcquireLock(lock: string, owner: LockOwner): Promise<boolean> {
  const recovery = `${lock}.recovery`;
  await clearRecoveryLock(recovery, lock);
  if (await linkOwner(owner, lock)) return true;
  const currentOwner = await readContendedOwner(lock);
  if (await ownerIsActive(currentOwner)) throw new Error(`refresh is busy: ${lock}`);
  return recoverAbandonedLock(lock, recovery, owner, currentOwner);
}

async function clearRecoveryLock(recovery: string, lock: string): Promise<void> {
  if (!(await Bun.file(recovery).exists())) return;
  const recoveryOwner = lockOwner(await Bun.file(recovery).json());
  if (await ownerIsActive(recoveryOwner)) throw new Error(`refresh is busy: ${lock}`);
  await remove(recovery);
}

async function readContendedOwner(lock: string): Promise<LockOwner> {
  try { return lockOwner(await Bun.file(lock).json()); }
  catch { throw new Error(`refresh is busy: unreadable lock ${lock}`); }
}

async function recoverAbandonedLock(lock: string, recovery: string, owner: LockOwner, currentOwner: LockOwner): Promise<boolean> {
  if (!(await linkOwner(owner, recovery))) return false;
  try {
    const latestOwner = lockOwner(await Bun.file(lock).json());
    if (latestOwner.token !== currentOwner.token) return false;
    await remove(lock);
    return linkOwner(owner, lock);
  } finally { await remove(recovery); }
}

async function releaseLock(lock: string, owner: LockOwner): Promise<void> {
  const currentOwner = lockOwner(await Bun.file(lock).json());
  if (currentOwner.token !== owner.token)
    throw new Error(`refresh lock ownership changed: ${lock}`);
  const released = await execute(["/bin/rm", "-f", lock]);
  if (released.exitCode !== 0) {
    throw new Error(`failed to release refresh lock: ${released.stderr}`);
  }
}

export async function assertRefreshWritable(root: string, date: string): Promise<void> {
  requiredDate(date, "refresh date");
  if (await Bun.file(`${root}/runs/${date}/manifest.json`).exists()) {
    throw new Error(`immutable refresh already sealed: ${date}`);
  }
}

export async function withRefreshMutation<T>(
  root: string,
  date: string,
  action: () => Promise<T>,
): Promise<T> {
  requiredDate(date, "refresh date");
  const parent = `${root}/runs/${date}`;
  const prepared = await execute(["/bin/mkdir", "-p", parent]);
  if (prepared.exitCode !== 0) throw new Error(`failed to prepare refresh: ${prepared.stderr}`);
  const lockRoot = `${root}/.refresh-locks`;
  const lockRootResult = await execute(["/bin/mkdir", "-p", lockRoot]);
  if (lockRootResult.exitCode !== 0) {
    throw new Error(`failed to prepare refresh lock: ${lockRootResult.stderr}`);
  }
  const lockName = `${date}.lock`;
  await removeAbandonedCandidates(lockRoot, lockName);
  const lock = `${lockRoot}/${lockName}`;
  const owner = await acquireLock(lock);
  try {
    await assertRefreshWritable(root, date);
    return await action();
  } finally {
    await releaseLock(lock, owner);
  }
}
