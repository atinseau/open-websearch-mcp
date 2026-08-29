import { expect, test } from "bun:test";
import { createProductionRoot } from "@/bootstrap";
import { resolveWorkspace } from "@/features/configuration";

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

function result() {
  return { investigation_id: "root-test", status: "success", confidence: "high", results: [] };
}
