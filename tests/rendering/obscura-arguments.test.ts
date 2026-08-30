import { expect, test } from "bun:test";

import { obscuraServeArguments } from "@/features/rendering";

const base = {
  host: "127.0.0.1",
  port: 9222,
  storageDirectory: "/workspace/profiles/google-public",
};

test("SEARCH-003 the Google profile is given a persistent storage directory", () => {
  // The connector reports a persistent profile; without this the renderer
  // opened every search with an empty store, so the promise was not kept.
  const argv = obscuraServeArguments(base);

  expect(argv).toContain("--storage-dir");
  expect(argv[argv.indexOf("--storage-dir") + 1]).toBe("/workspace/profiles/google-public");
});

test("stealth stays enabled alongside the persistent profile", () => {
  expect(obscuraServeArguments(base)).toContain("--stealth");
});

test("SECURITY-010 no personal browser profile is ever adopted", () => {
  const argv = obscuraServeArguments(base);

  // The directory is inside the product's own workspace, never a system
  // browser profile whose session we would be reusing.
  expect(argv[argv.indexOf("--storage-dir") + 1]).toStartWith("/workspace/");
});

test("a run without a storage directory stays ephemeral rather than guessing one", () => {
  const argv = obscuraServeArguments({ ...base, storageDirectory: undefined });

  expect(argv).not.toContain("--storage-dir");
});

test("the private-network switch is still absent unless a fixture asks for it", () => {
  expect(obscuraServeArguments(base)).not.toContain("--allow-private-network");
  expect(obscuraServeArguments({ ...base, allowPrivateNetwork: true })).toContain(
    "--allow-private-network",
  );
});
