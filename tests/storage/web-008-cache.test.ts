import { expect, test } from "bun:test";

import {
  canonicalizeUrl,
  findNearDuplicate,
  nearDuplicateSignature,
  nearDuplicateSimilarity,
  openStorage,
  type BlobReference,
  type CacheTtls,
  type StorageOptions,
} from "@/features/storage";

const ttls: CacheTtls = {
  newsTtlSeconds: 900,
  generalTtlSeconds: 86_400,
  docsTtlSeconds: 604_800,
  versionedTtlSeconds: 2_592_000,
};
const fetchedAt = new Date("2026-08-01T00:00:00.000Z");

test("CACHE-011 canonicalizes equivalent URLs without collapsing distinct pages", () => {
  expect(
    key("HTTPS://Example.COM:443/articles/%7eguide/?utm_source=newsletter&gclid=one#part"),
  ).toBe("https://example.com/articles/~guide");
  expect(key("https://example.com/articles/~guide/")).toBe("https://example.com/articles/~guide");
  expect(key("https://example.com/article?id=1")).not.toBe(key("https://example.com/article?id=2"));
  expect(key("https://example.com/a%2fb")).not.toBe(key("https://example.com/a/b"));
});

test("RANK-008 uses deterministic lexical MinHash at the configured threshold", () => {
  const original = content(0);
  const above = content(16);
  const below = content(18);
  const candidate = {
    canonicalUrl: new URL("https://example.com/original"),
    signature: nearDuplicateSignature(original)!,
  };
  const aboveScore = nearDuplicateSimilarity(candidate.signature, nearDuplicateSignature(above)!);
  const belowScore = nearDuplicateSimilarity(candidate.signature, nearDuplicateSignature(below)!);
  expect(aboveScore).toBe(0.90625);
  expect(belowScore).toBe(0.890625);
  expect(findNearDuplicate(above, [candidate], 0.9)?.canonicalUrl.href).toBe(
    candidate.canonicalUrl.href,
  );
  expect(findNearDuplicate(below, [candidate], 0.9)).toBeUndefined();
  expect(nearDuplicateSignature(original)).toEqual(nearDuplicateSignature(original));
});

test("CACHE-011 indexes cached main content for local FTS5 search", async () => {
  const storage = await openStorage({ workspace: workspace() });
  await storage.cache.put(
    document(
      "https://example.com/release",
      await storage.blobs.put("release body"),
      "launch overview",
    ),
    { nearDuplicateThreshold: 0.9 },
  );
  const result = await storage.cache.search("launch overview");
  expect(result.diagnostic).toBeUndefined();
  expect(result.results.map(({ document: cached }) => cached.url.href)).toEqual([
    "https://example.com/release",
  ]);
  storage.close();
});

test("RANK-008 retains one representative for near duplicates", async () => {
  const storage = await openStorage({ workspace: workspace() });
  await storage.cache.put(
    document("https://example.com/original", await storage.blobs.put("original"), content(0)),
    { nearDuplicateThreshold: 0.9 },
  );
  await storage.cache.put(
    document("https://example.com/alias", await storage.blobs.put("alias"), content(16)),
    { nearDuplicateThreshold: 0.9 },
  );
  await storage.cache.put(
    document(
      "https://example.com/different",
      await storage.blobs.put("different"),
      distinctContent(),
    ),
    { nearDuplicateThreshold: 0.9 },
  );
  const alias = await storage.cache.get(new URL("https://example.com/alias"), {
    now: fetchedAt,
    ttls,
  });
  const different = await storage.cache.get(new URL("https://example.com/different"), {
    now: fetchedAt,
    ttls,
  });
  expect(alias?.document.url.href).toBe("https://example.com/original");
  expect(different?.document.url.href).toBe("https://example.com/different");
  storage.close();
});

test("TEST-022 degrades FTS search only and leaves cache retrieval working", async () => {
  const storage = await openStorage({ workspace: workspace(), fts5Database: unavailableFts() });
  await storage.cache.put(
    document("https://example.com/cache", await storage.blobs.put("body"), "cache document"),
    { nearDuplicateThreshold: 0.9 },
  );
  expect(await storage.cache.search("cache")).toEqual({
    results: [],
    diagnostic: "sqlite_fts5_unavailable",
  });
  expect(
    await storage.cache.get(new URL("https://example.com/cache"), { now: fetchedAt, ttls }),
  ).toMatchObject({
    provenance: "local_cache",
    fresh: true,
  });
  expect(storage.diagnostics[0]?.code).toBe("sqlite_fts5_unavailable");
  storage.close();
});

test("CACHE-011 deduplicates a revalidated canonical page without a new entry", async () => {
  const storage = await openStorage({ workspace: workspace() });
  await storage.cache.put(
    document(
      "https://example.com/page/?utm_medium=email",
      await storage.blobs.put("old"),
      "first version",
    ),
    { nearDuplicateThreshold: 0.9 },
  );
  await storage.cache.put(
    document("https://example.com/page", await storage.blobs.put("new"), "revalidated version"),
    { nearDuplicateThreshold: 0.9 },
  );
  const cached = await storage.cache.get(new URL("https://example.com/page/?fbclid=click"), {
    now: fetchedAt,
    ttls,
  });
  expect(cached?.document.url.href).toBe("https://example.com/page");
  expect(new TextDecoder().decode(await storage.blobs.get(cached!.document.body))).toBe("new");
  storage.close();
});

function key(value: string): string {
  return canonicalizeUrl(new URL(value)).href;
}

function content(changed: number): string {
  return Array.from({ length: 200 }, (_, index) =>
    index < 200 - changed ? `word${index}` : `other${index}`,
  ).join(" ");
}

function distinctContent(): string {
  return Array.from({ length: 200 }, (_, index) => `topic${index}`).join(" ");
}

function workspace(): string {
  return `/private/tmp/open-websearch-web-008-${crypto.randomUUID()}`;
}

function document(url: string, body: BlobReference, mainContent: string) {
  return {
    url: new URL(url),
    body,
    contentClass: "general" as const,
    bodyKind: "text" as const,
    fetchedAt,
    mainContent,
  };
}

function unavailableFts(): StorageOptions["fts5Database"] {
  return { prepare: () => ({ get: failFts, run: failFts }) };
}

function failFts(): never {
  throw new Error("no fts5");
}

test("CACHE-005 never writes a no-store response to disk", async () => {
  // `no-store` forbids storing the response at all, unlike `no-cache` which
  // only forbids reusing it without revalidation. Expiring the entry left the
  // body, its text, and its validators on disk, surviving a restart.
  const shared = workspace();
  const storage = await openStorage({ workspace: shared });
  await storage.cache.put({
    ...document("https://private.example/session", await storage.blobs.put("secret"), "secret"),
    headers: new Headers({ "cache-control": "no-store", etag: "private-etag" }),
  });
  await storage.cache.put({
    ...document("https://public.example/page", await storage.blobs.put("public"), "public body"),
    headers: new Headers({ "cache-control": "no-cache" }),
  });
  storage.close();

  const reopened = await openStorage({ workspace: shared });
  const read = { now: fetchedAt, ttls };
  expect(
    await reopened.cache.get(new URL("https://private.example/session"), read),
  ).toBeUndefined();
  // `no-cache` is still stored; it is merely stale, so revalidation can reuse it.
  expect(await reopened.cache.get(new URL("https://public.example/page"), read)).toBeDefined();
  reopened.close();
});

test("CACHE-005 expires an entry at the origin's own max-age", async () => {
  // A regex typo made `max-age` never match, so every page silently fell back
  // to the 24h content-class TTL. No test exercised max-age, which is exactly
  // why it went unnoticed.
  const storage = await openStorage({ workspace: workspace() });
  await storage.cache.put({
    ...document("https://short.example/page", await storage.blobs.put("body"), "short lived"),
    headers: new Headers({ "cache-control": "public, max-age=60" }),
  });
  const read = (offsetSeconds: number) => ({
    now: new Date(fetchedAt.getTime() + offsetSeconds * 1000),
    ttls,
  });
  const url = new URL("https://short.example/page");
  expect((await storage.cache.get(url, read(30)))?.fresh).toBeTrue();
  // Past its declared lifetime but well inside the 24h general TTL: without the
  // origin's directive this would still be reported fresh.
  expect((await storage.cache.get(url, read(120)))?.fresh).toBeFalse();
  storage.close();
});
