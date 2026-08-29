import { expect, test } from "bun:test";

import { createInvestigationService } from "@/features/investigation";
import { openStorage } from "@/features/storage";

function workspace(): string {
  return `/private/tmp/open-websearch-investigation-${crypto.randomUUID()}`;
}

async function serviceAt(path = workspace()) {
  const storage = await openStorage({ workspace: path });
  return { service: createInvestigationService(storage), storage };
}

test("CACHE-007 creates persistent investigations and resumes an effective supplied ID", async () => {
  const { service, storage } = await serviceAt();
  const created = await service.resolve();
  const resumed = await service.resolve(created.id);

  expect(created.id).toBeString();
  expect(resumed).toEqual(created);
  storage.close();
});

test("PROD-007 exploration prepares a page without consuming it", async () => {
  const { service, storage } = await serviceAt();
  const investigation = await service.resolve();
  const exploration = await service.explore({
    investigationId: investigation.id,
    signal: new AbortController().signal,
    explore: async () => "candidate evaluated internally",
  });
  const explored = await successfulConsumption(service, investigation.id, "explored evidence");

  expect(exploration).toMatchObject({
    state: "explored",
    response: "candidate evaluated internally",
  });
  expect(explored).toMatchObject({ state: "consumed", response: "explored evidence" });
  storage.close();
});

test("CACHE-008 failures and cancellation before commitment leave the page eligible", async () => {
  const { service, storage } = await serviceAt();
  const id = (await service.resolve()).id;
  const url = new URL("https://example.com/failure");

  expect(
    await rejectionMessage(
      service.consumePreparedPage({
        investigationId: id,
        url,
        signal: new AbortController().signal,
        prepareForEmission: async () => Promise.reject(new Error("render failed")),
      }),
    ),
  ).toBe("render failed");

  const controller = new AbortController();
  const cancelled = await service.consumePreparedPage({
    investigationId: id,
    url,
    signal: controller.signal,
    prepareForEmission: async () => {
      controller.abort();
      return "discarded";
    },
  });
  const retry = await successfulConsumption(service, id, "usable evidence", url);

  expect(cancelled.state).toBe("cancelled");
  expect(retry).toMatchObject({ state: "consumed", response: "usable evidence" });
  storage.close();
});

test("CACHE-009 concurrent calls emit a prepared page at most once", async () => {
  const path = workspace();
  const { service: firstService, storage: firstStorage } = await serviceAt(path);
  const secondStorage = await openStorage({ workspace: path });
  const secondService = createInvestigationService(secondStorage);
  const id = (await firstService.resolve()).id;
  const url = new URL("https://example.com/concurrent");
  const gate = Promise.withResolvers<void>();
  const attempts = Array.from({ length: 20 }, (_, index) =>
    (index % 2 === 0 ? firstService : secondService).consumePreparedPage({
      investigationId: id,
      url,
      signal: new AbortController().signal,
      prepareForEmission: async () => {
        await gate.promise;
        return "prepared once";
      },
    }),
  );

  gate.resolve();
  const results = await Promise.all(attempts);

  expect(results.filter((result) => result.state === "consumed")).toHaveLength(1);
  expect(results.filter((result) => result.state === "already_consumed")).toHaveLength(19);
  firstStorage.close();
  secondStorage.close();
});

test("CACHE-001 consumption is isolated between investigations", async () => {
  const { service, storage } = await serviceAt();
  const url = new URL("https://example.com/shared");
  const first = await successfulConsumption(service, undefined, "first", url);
  const second = await successfulConsumption(service, undefined, "second", url);

  expect(first).toMatchObject({ state: "consumed", response: "first" });
  expect(second).toMatchObject({ state: "consumed", response: "second" });
  expect(first.investigation.id).not.toBe(second.investigation.id);
  storage.close();
});

function successfulConsumption(
  service: ReturnType<typeof createInvestigationService>,
  investigationId: string | undefined,
  response: string,
  url = new URL("https://example.com/explored"),
) {
  return service.consumePreparedPage({
    investigationId,
    url,
    signal: new AbortController().signal,
    prepareForEmission: async () => response,
  });
}

async function rejectionMessage(value: Promise<unknown>): Promise<string> {
  try {
    await value;
    return "did not reject";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
