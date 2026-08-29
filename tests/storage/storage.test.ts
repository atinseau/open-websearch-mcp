import { expect, test } from "bun:test";

import { openStorage, type StorageOptions } from "@/features/storage";

function workspace(): string {
  return `/private/tmp/open-websearch-storage-${crypto.randomUUID()}`;
}

test("CACHE-002 enables WAL and persists versioned migrations idempotently", async () => {
  const path = workspace();
  const first = await openStorage({ workspace: path });
  expect(first.journalMode()).toBe("wal");
  expect(first.advancedLocalSearch.advancedLocalSearch).toBe("enabled");
  expect(first.migrationVersions()).toEqual([1, 2, 3]);
  first.close();

  const second = await openStorage({ workspace: path });
  expect(second.migrationVersions()).toEqual([1, 2, 3]);
  second.close();
});

test("CACHE-002 recovers after an interrupted forward-only migration", async () => {
  const path = workspace();
  expect(await rejectionMessage(openStorage({ workspace: path, beforeMigration: interrupt }))).toBe(
    "interrupted",
  );

  const storage = await openStorage({ workspace: path });
  expect(storage.migrationVersions()).toEqual([1, 2, 3]);
  storage.close();
});

test("TEST-022 degrades only advanced local search without installing anything", async () => {
  const unavailable: StorageOptions["fts5Database"] = {
    prepare: () => ({
      get: () => {
        throw new Error("no fts5");
      },
      run: () => {
        throw new Error("no fts5");
      },
    }),
  };
  const storage = await openStorage({ workspace: workspace(), fts5Database: unavailable });
  expect(storage.advancedLocalSearch).toEqual({
    advancedLocalSearch: "degraded",
    automaticHomebrewInstall: false,
    diagnostic: "sqlite_fts5_unavailable",
  });
  expect(storage.diagnostics).toEqual([
    {
      code: "sqlite_fts5_unavailable",
      message: "SQLite FTS5 is unavailable; advanced local search is disabled.",
    },
  ]);
  expect(await storage.blobs.put("cache remains available")).toMatchObject({
    byteLength: 23,
  });
  storage.close();
});

test("CACHE-002 blobs round-trip and reject corruption", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const reference = await storage.blobs.put("verified body");
  expect(new TextDecoder().decode(await storage.blobs.get(reference))).toBe("verified body");
  await Bun.write(reference.path, "corrupt");
  expect(await rejectionMessage(storage.blobs.get(reference))).toContain(
    "integrity verification failed",
  );
  storage.close();
});

test("CACHE-009 reserves a consumed page at most once under concurrent access", async () => {
  const path = workspace();
  const storage = await openStorage({ workspace: path });
  const peer = await openStorage({ workspace: path });
  const input = {
    investigationId: "investigation-1",
    url: new URL("https://example.com/page"),
    signal: new AbortController().signal,
  };
  const reservations = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      (index % 2 === 0 ? storage : peer).reserveConsumedPage(input),
    ),
  );
  expect(reservations.filter(({ reserved }) => reserved)).toHaveLength(1);
  storage.close();
  peer.close();
});

function interrupt(): never {
  throw new Error("interrupted");
}

async function rejectionMessage(value: Promise<unknown>): Promise<string> {
  try {
    await value;
    return "did not reject";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
