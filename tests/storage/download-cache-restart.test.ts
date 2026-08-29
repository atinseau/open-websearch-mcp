import { expect, test } from "bun:test";
import { openStorage, type CacheTtls } from "@/features/storage";

const ttls: CacheTtls = {
  newsTtlSeconds: 900,
  generalTtlSeconds: 86_400,
  docsTtlSeconds: 604_800,
  versionedTtlSeconds: 2_592_000,
};

test("CACHE-010 survives restart with cached metadata and bodies", async () => {
  const workspace = `/private/tmp/open-websearch-web-004-${crypto.randomUUID()}`;
  const first = await openStorage({ workspace });
  const body = await first.blobs.put("restart");
  await first.cache.put({
    url: new URL("https://example.com/restart"),
    body,
    contentClass: "versioned",
    bodyKind: "rendered",
    fetchedAt: new Date("2026-08-01T00:00:00.000Z"),
    pinned: false,
  });
  first.close();
  const second = await openStorage({ workspace });
  const cached = await second.cache.get(new URL("https://example.com/restart"), {
    now: new Date("2026-08-02T00:00:00.000Z"),
    ttls,
  });
  expect(cached?.fresh).toBe(true);
  expect(new TextDecoder().decode(await second.blobs.get(cached!.document.body))).toBe("restart");
  second.close();
});
