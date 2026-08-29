import { expect, test } from "bun:test";
import { createProductionRoot } from "@/bootstrap";
import { resolveWorkspace } from "@/features/configuration";
import type { InvestigationApplication } from "@/features/investigation";
import type { Renderer } from "@/features/rendering";
import type { PublicUrlPolicy } from "@/features/security";

test("ARCH-010 real composed call loads config, opens storage, and writes a session log", async () => {
  const root = `/private/tmp/open-websearch-root-${crypto.randomUUID()}`;
  const workspace = resolveWorkspace(root);
  let observedLimit = 0;
  const composed = await createProductionRoot({
    workspace,
    application: {
      async webSearch(_input, context) {
        observedLimit = context.configuration.configuration?.mcp.max_inbound_message_bytes ?? 0;
        return { investigationId: "root-test", structuredContent: result() };
      },
      async webOpen() {
        return { investigationId: "root-test", structuredContent: result() };
      },
    },
  });
  await composed.tools.webSearch({ query: "configuration evidence" });
  await composed.close();
  expect(observedLimit).toBe(4_194_304);
  expect(await Bun.file(`${root}/state.sqlite`).exists()).toBe(true);
  expect(await Bun.file(`${root}/config.toml`).exists()).toBe(true);
  expect(
    (await Array.fromAsync(new Bun.Glob("*.jsonl").scan({ cwd: `${root}/logs` }))).length,
  ).toBe(1);
});

test("ARCH-010 composed web runtime injects the renderer and public policy into its application", async () => {
  const root = `/private/tmp/open-websearch-web-runtime-${crypto.randomUUID()}`;
  const workspace = resolveWorkspace(root);
  let renderer: Renderer | undefined;
  let policy: PublicUrlPolicy | undefined;
  const application: InvestigationApplication & {
    bindWebRuntime(renderer: Renderer, policy: PublicUrlPolicy): void;
  } = {
    bindWebRuntime(boundRenderer, boundPolicy) {
      renderer = boundRenderer;
      policy = boundPolicy;
    },
    async webSearch() {
      return { investigationId: "root-test", structuredContent: result() };
    },
    async webOpen() {
      if (!renderer || !policy) throw new Error("web_runtime_not_bound");
      expect(policy.assess(new URL("http://127.0.0.1/admin")).allowed).toBeFalse();
      let failure: unknown;
      try {
        await renderer.render({
          url: new URL("http://127.0.0.1/admin"),
          signal: new AbortController().signal,
          investigationId: "root-test",
          kind: "destination",
          explicitOpen: true,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      if (failure instanceof Error) expect(failure.message).toContain("non_public_address");
      return { investigationId: "root-test", structuredContent: result() };
    },
  };
  const composed = await createProductionRoot({
    workspace,
    obscuraArtifact: {
      version: "fixture",
      variant: "macos-arm64",
      url: "https://example.com/obscura.zip",
      sha256: "0".repeat(64),
      sizeBytes: 1,
      expectedFiles: ["obscura", "obscura-worker"],
    },
    application,
  });
  await composed.tools.webOpen({ url: new URL("https://example.com") });
  await composed.close();
  expect(renderer).toBeDefined();
});

test("RENDER-005 rejects a configuration pin not packaged as immutable release data", async () => {
  const root = `/private/tmp/open-websearch-pin-${crypto.randomUUID()}`;
  await Bun.write(
    `${root}/config.toml`,
    '[renderer.obscura]\nversion = "latest"\nvariant = "aarch64-macos-stealth"\n',
  );
  expect(await rejection(createProductionRoot({ workspace: resolveWorkspace(root) }))).toContain(
    `${root}/config.toml requests latest/aarch64-macos-stealth; expected 0.2.1/aarch64-macos-stealth`,
  );
});

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof Error ? error.message : "unknown";
  }
}

function result() {
  return { investigation_id: "root-test", status: "success", confidence: "high", results: [] };
}
