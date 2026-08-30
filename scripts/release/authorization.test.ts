import { expect, test } from "bun:test";

import { parseAuthorization } from "./authorization.ts";

const valid = {
  schema_version: 1,
  commit: "bc2f2eb0000000000000000000000000000000000",
  version: "0.1.1",
  package: "open-websearch-mcp",
  dist_tag: "latest",
  approved_by: "atinseau",
  tarball_sha256: "a".repeat(64),
};

test("a complete authorization parses into the shape the driver consumes", () => {
  const authorization = parseAuthorization(JSON.stringify(valid));

  expect(authorization.version).toBe("0.1.1");
  expect(authorization.approvedBy).toBe("atinseau");
  expect(authorization.distTag).toBe("latest");
});

test.each([
  ["approved_by", "approv"],
  ["commit", "commit"],
  ["tarball_sha256", "sha"],
  ["version", "version"],
])("an authorization missing %s is refused", (field, expected) => {
  const incomplete: Record<string, unknown> = { ...valid };
  delete incomplete[field];

  expect(() => parseAuthorization(JSON.stringify(incomplete))).toThrow(new RegExp(expected, "i"));
});

test("an unknown schema version is refused rather than guessed", () => {
  expect(() => parseAuthorization(JSON.stringify({ ...valid, schema_version: 2 }))).toThrow(
    /schema/i,
  );
});
