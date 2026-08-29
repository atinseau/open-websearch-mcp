import { expect, test } from "bun:test";

import { resolveAliasProof } from "@/consumer.ts";

test("Bun test resolves the shared alias", () => {
  expect(resolveAliasProof()).toBe("resolved-by-bun-ts7-oxlint-and-test");
});
