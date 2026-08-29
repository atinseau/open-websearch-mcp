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

export async function acquireControllerLock(repository: string): Promise<() => Promise<void>> {
  const lockRoot = `${repository}/.worktree`;
  const lock = `${lockRoot}/.controller-lock`;
  const recovery = `${lockRoot}/.controller-lock-recovery`;
  const token = crypto.randomUUID();
  const candidate = `${lockRoot}/.controller-owner-${process.pid}-${token}.json`;
  const owner: LockOwner = {
    pid: process.pid,
    token,
    candidate,
    started_at: new Date().toISOString(),
  };
  await run(["mkdir", "-p", lockRoot], repository);
  await Bun.write(candidate, JSON.stringify(owner));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await Bun.file(recovery).exists()) {
      const recoveryOwner = await readLock(recovery);
      if (recoveryOwner?.pid) {
        const probe = Bun.spawn(["kill", "-0", String(recoveryOwner.pid)], {
          stdout: "ignore",
          stderr: "ignore",
        });
        if ((await probe.exited) === 0) {
          await Bun.sleep(20);
          continue;
        }
      } else {
        const modifiedAt = Number(await run(["stat", "-f", "%m", recovery], repository));
        if (Date.now() / 1_000 - modifiedAt < 30) {
          await Bun.sleep(20);
          continue;
        }
      }
      await run(["rm", recovery], repository).catch(() => undefined);
      if (recoveryOwner?.candidate?.startsWith(`${lockRoot}/.controller-owner-`)) {
        await run(["rm", recoveryOwner.candidate], repository).catch(() => undefined);
      }
      continue;
    }
    try {
      await run(["ln", candidate, lock], repository);
      return async () => {
        const current = await readLock(lock);
        if (current?.token === token) await run(["rm", lock], repository).catch(() => undefined);
        await run(["rm", candidate], repository).catch(() => undefined);
      };
    } catch {
      const current = await readLock(lock);
      if (!current?.pid || !current.token) {
        const modifiedAt = Number(await run(["stat", "-f", "%m", lock], repository));
        if (Date.now() / 1_000 - modifiedAt < 30) {
          await run(["rm", candidate], repository).catch(() => undefined);
          throw new Error("Another controller is acquiring the lock");
        }
      } else {
        const probe = Bun.spawn(["kill", "-0", String(current.pid)], {
          stdout: "ignore",
          stderr: "ignore",
        });
        if ((await probe.exited) === 0) {
          await run(["rm", candidate], repository).catch(() => undefined);
          throw new Error("Another controller is already running");
        }
      }

      try {
        await run(["ln", candidate, recovery], repository);
      } catch {
        await Bun.sleep(20);
        continue;
      }
      try {
        const stale = await readLock(lock);
        if (stale?.token === current?.token || (!stale && !current)) {
          await run(["rm", lock], repository).catch(() => undefined);
          if (stale?.candidate?.startsWith(`${lockRoot}/.controller-owner-`)) {
            await run(["rm", stale.candidate], repository).catch(() => undefined);
          }
          await run(["ln", candidate, lock], repository);
          return async () => {
            const held = await readLock(lock);
            if (held?.token === token) await run(["rm", lock], repository).catch(() => undefined);
            await run(["rm", candidate], repository).catch(() => undefined);
          };
        }
      } finally {
        await run(["rm", recovery], repository).catch(() => undefined);
      }
    }
  }
  await run(["rm", candidate], repository).catch(() => undefined);
  throw new Error("Could not acquire controller lock");
}
