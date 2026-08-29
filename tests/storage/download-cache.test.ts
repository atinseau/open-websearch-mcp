import { expect, test } from "bun:test";

import {
  createDownloadBudget,
  downloadDocument,
  openStorage,
  type BlobReference,
  type CacheTtls,
  type DownloadTransport,
} from "@/features/storage";

const encoder = new TextEncoder();
const ttls: CacheTtls = {
  newsTtlSeconds: 900,
  generalTtlSeconds: 86_400,
  docsTtlSeconds: 604_800,
  versionedTtlSeconds: 2_592_000,
};

function workspace(): string {
  return `/private/tmp/open-websearch-web-004-${crypto.randomUUID()}`;
}

function transport(response: Response): DownloadTransport {
  return { fetch: async () => response };
}

const publicPolicy = { assess: () => ({ allowed: true }) };

function body(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

test("RENDER-011 streams a large document without Response.arrayBuffer", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const chunks = Array.from({ length: 96 }, () => "x".repeat(256 * 1024));
  const response = new Response(body(...chunks));
  Object.defineProperty(response, "arrayBuffer", {
    value: () => Promise.reject(new Error("buffered")),
  });
  const result = await downloadDocument({
    url: new URL("https://example.com/large"),
    policy: publicPolicy,
    transport: transport(response),
    blobs: storage.blobs,
    budget: createDownloadBudget(),
  });
  expect(result.body.byteLength).toBe(24 * 1024 * 1024);
  expect((await storage.blobs.get(result.body)).byteLength).toBe(24 * 1024 * 1024);
  storage.close();
});

test("RENDER-011 rejects honest and lying declared sizes plus aggregate overflow", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const budget = createDownloadBudget(10);
  const honest = new Response(body("small"), { headers: { "content-length": "11" } });
  expect(
    await rejection(
      downloadDocument({
        url: new URL("https://example.com/honest"),
        policy: publicPolicy,
        transport: transport(honest),
        blobs: storage.blobs,
        budget,
      }),
    ),
  ).toBeInstanceOf(Error);
  const liar = new Response(body("12345", "67890", "x"), { headers: { "content-length": "1" } });
  expect(
    await rejection(
      downloadDocument({
        url: new URL("https://example.com/liar"),
        policy: publicPolicy,
        transport: transport(liar),
        blobs: storage.blobs,
        budget: createDownloadBudget(10),
      }),
    ),
  ).toBeInstanceOf(Error);
  const shared = createDownloadBudget(10);
  await downloadDocument({
    url: new URL("https://example.com/one"),
    policy: publicPolicy,
    transport: transport(new Response(body("12345"))),
    blobs: storage.blobs,
    budget: shared,
  });
  expect(
    await rejection(
      downloadDocument({
        url: new URL("https://example.com/two"),
        policy: publicPolicy,
        transport: transport(new Response(body("678901"))),
        blobs: storage.blobs,
        budget: shared,
      }),
    ),
  ).toBeInstanceOf(Error);
  storage.close();
});

test("SECURITY-004 aborts a decompression bomb after decoded bytes exceed the bound", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const compressedHeader = new Response(body("123456", "789012"), {
    headers: { "content-encoding": "gzip", "content-length": "2" },
  });
  expect(
    await rejection(
      downloadDocument({
        url: new URL("https://example.com/bomb"),
        policy: publicPolicy,
        transport: transport(compressedHeader),
        blobs: storage.blobs,
        budget: createDownloadBudget(10),
      }),
    ),
  ).toBeInstanceOf(Error);
  storage.close();
});

test("CACHE-002 persists streamed content under an atomic content hash", async () => {
  const root = workspace();
  const storage = await openStorage({ workspace: root });
  const result = await downloadDocument({
    url: new URL("https://example.com/hash"),
    policy: publicPolicy,
    transport: transport(new Response(body("atomic body"))),
    blobs: storage.blobs,
    budget: createDownloadBudget(),
  });
  expect(result.body.path.endsWith(result.body.digest)).toBe(true);
  expect(await Bun.file(result.body.path).exists()).toBe(true);
  expect(await Array.fromAsync(new Bun.Glob("*.tmp").scan({ cwd: `${root}/cache/blobs` }))).toEqual(
    [],
  );
  storage.close();
});

test("CACHE-005 returns local provenance and honors class TTL and revalidation", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const fetchedAt = new Date("2026-08-01T00:00:00.000Z");
  const reference = await storage.blobs.put("cached");
  await storage.cache.put(document("https://example.com/news", reference, "news", fetchedAt));
  expect(
    (
      await storage.cache.get(new URL("https://example.com/news"), {
        now: new Date("2026-08-01T00:14:59.000Z"),
        ttls,
      })
    )?.provenance,
  ).toBe("local_cache");
  expect(
    (
      await storage.cache.get(new URL("https://example.com/news"), {
        now: new Date("2026-08-01T00:15:00.000Z"),
        ttls,
      })
    )?.revalidate,
  ).toBe(true);
  await storage.cache.put(document("https://example.com/docs", reference, "docs", fetchedAt));
  expect(
    (
      await storage.cache.get(new URL("https://example.com/docs"), {
        now: new Date("2026-08-07T23:59:59.000Z"),
        ttls,
        forceRevalidate: true,
      })
    )?.revalidate,
  ).toBe(true);
  storage.close();
});

test("CACHE-006 evicts LRU bodies in priority order while preserving pins", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const at = new Date("2026-08-01T00:00:00.000Z");
  await storage.cache.put(
    document(
      "https://example.com/binary",
      await storage.blobs.put("11111"),
      "general",
      at,
      "binary",
    ),
  );
  await storage.cache.put(
    document(
      "https://example.com/rendered",
      await storage.blobs.put("22222"),
      "general",
      at,
      "rendered",
    ),
  );
  await storage.cache.put(
    document(
      "https://example.com/pinned",
      await storage.blobs.put("33333"),
      "general",
      at,
      "binary",
      true,
    ),
  );
  await storage.cache.evict(5);
  expect(
    await storage.cache.get(new URL("https://example.com/binary"), { now: at, ttls }),
  ).toBeUndefined();
  expect(
    await storage.cache.get(new URL("https://example.com/rendered"), { now: at, ttls }),
  ).toBeUndefined();
  expect(
    await storage.cache.get(new URL("https://example.com/pinned"), { now: at, ttls }),
  ).toBeDefined();
  storage.close();
});

test("CACHE-006 uses least-recent access within a body kind", async () => {
  const storage = await openStorage({ workspace: workspace() });
  const at = new Date("2026-08-01T00:00:00.000Z");
  await storage.cache.put(
    document("https://example.com/old", await storage.blobs.put("11111"), "general", at),
  );
  await storage.cache.put(
    document("https://example.com/new", await storage.blobs.put("22222"), "general", at),
  );
  await storage.cache.get(new URL("https://example.com/old"), {
    now: new Date("2026-08-01T01:00:00.000Z"),
    ttls,
  });
  await storage.cache.evict(5);
  expect(
    await storage.cache.get(new URL("https://example.com/old"), { now: at, ttls }),
  ).toBeDefined();
  expect(
    await storage.cache.get(new URL("https://example.com/new"), { now: at, ttls }),
  ).toBeUndefined();
  storage.close();
});

test("CACHE-010 survives restart with cached metadata and bodies", async () => {
  const root = workspace();
  const first = await openStorage({ workspace: root });
  const reference = await first.blobs.put("restart");
  await first.cache.put(
    document(
      "https://example.com/restart",
      reference,
      "versioned",
      new Date("2026-08-01T00:00:00.000Z"),
    ),
  );
  first.close();
  const second = await openStorage({ workspace: root });
  const cached = await second.cache.get(new URL("https://example.com/restart"), {
    now: new Date("2026-08-02T00:00:00.000Z"),
    ttls,
  });
  expect(cached?.fresh).toBe(true);
  expect(new TextDecoder().decode(await second.blobs.get(cached!.document.body))).toBe("restart");
  second.close();
});

function document(
  href: string,
  reference: BlobReference,
  contentClass: "news" | "general" | "docs" | "versioned",
  fetchedAt: Date,
  bodyKind: "binary" | "rendered" | "text" = "rendered",
  pinned = false,
) {
  return { url: new URL(href), body: reference, contentClass, bodyKind, fetchedAt, pinned };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}
