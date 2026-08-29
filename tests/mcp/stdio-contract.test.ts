import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { structuredToolResultSchema } from "@/mcp/contracts";

function createClient(): Client {
  return new Client(
    { name: "contract-client", version: "0.0.0" },
    { supportedProtocolVersions: ["2025-06-18", "2024-11-05"] },
  );
}

function createTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: "bun",
    args: ["tests/mcp/fixture-server.ts"],
    cwd: import.meta.dir + "/../..",
    stderr: "pipe",
  });
}

function createProductionTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: "bun",
    args: ["src/cli.ts"],
    cwd: import.meta.dir + "/../..",
    stderr: "pipe",
    env: { ...Bun.env, HOME: `/private/tmp/open-websearch-cli-${crypto.randomUUID()}` },
  });
}

test("MCP-001/MCP-002/MCP-003/MCP-005/MCP-006: official client calls real stdio server", async () => {
  const client = createClient();
  const transport = createTransport();
  await client.connect(transport);
  const listed = await client.listTools();
  expect(listed.tools.map((tool) => tool.name).sort()).toEqual(["web_open", "web_search"]);
  const search = await client.callTool({
    name: "web_search",
    arguments: { query: "site:example.com evidence" },
  });
  expect(search.structuredContent).toMatchObject({
    investigation_id: "investigation-fixture",
    status: "success",
  });
  const text = search.content?.find((item) => item.type === "text");
  expect(text).toMatchObject({ type: "text" });
  expect(text?.text).toContain("```ts\nconst untrusted = true;\n```");
  expect(text?.text).toContain("trust=external_untrusted");
  expect(text?.text).toContain('warnings=["zero_width_space"]');
  const open = await client.callTool({
    name: "web_open",
    arguments: { url: "https://example.com/evidence" },
  });
  expect(open.structuredContent).toMatchObject({
    investigation_id: "investigation-fixture",
    status: "success",
  });
  await client.close();
});

test("MCP-001 real package bin initializes, lists tools, and accepts web_search", async () => {
  const client = createClient();
  await client.connect(createProductionTransport());
  expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
    "web_open",
    "web_search",
  ]);
  const search = await client.callTool({ name: "web_search", arguments: { query: "evidence" } });
  expect(search.structuredContent).toMatchObject({ status: expect.any(String) });
  await client.close();
}, 30_000);

test("MCP-002/MCP-003: SDK rejects invalid arguments before application dispatch", async () => {
  const client = createClient();
  const transport = createTransport();
  await client.connect(transport);
  const badSearch = await client.callTool({
    name: "web_search",
    arguments: { query: "x", max_results: 11 },
  });
  const badOpen = await client.callTool({ name: "web_open", arguments: { url: "not a url" } });
  expect(badSearch.isError).toBe(true);
  expect(badOpen.isError).toBe(true);
  await client.close();
});

test("MCP-008: server negotiates each supported legacy protocol revision", async () => {
  for (const version of ["2024-11-05", "2025-06-18"]) {
    const client = new Client(
      { name: "protocol-client", version: "0.0.0" },
      { supportedProtocolVersions: [version] },
    );
    await client.connect(createTransport());
    expect((await client.listTools()).tools).toHaveLength(2);
    await client.close();
  }
});

test("MCP-009: server advertises tools only", async () => {
  const client = createClient();
  await client.connect(createTransport());
  expect(client.getServerCapabilities()).toEqual({ tools: { listChanged: true } });
  expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
    "web_open",
    "web_search",
  ]);
  expect((await client.listResources()).resources).toEqual([]);
  expect((await client.listPrompts()).prompts).toEqual([]);
  await client.close();
});

test("MCP-006: content-only and structured-only consumers each receive essential results", async () => {
  const client = createClient();
  await client.connect(createTransport());
  const response = await client.callTool({ name: "web_search", arguments: { query: "portable" } });
  const textOnly = response.content?.find((item) => item.type === "text")?.text;
  const structuredOnly = structuredToolResultSchema.parse(response.structuredContent);
  expect(textOnly).toContain("investigation_id=investigation-fixture");
  expect(textOnly).toContain("Fixture evidence: portable");
  expect(structuredOnly.investigation_id).toBe("investigation-fixture");
  expect(structuredOnly.results).toHaveLength(1);
  await client.close();
});

test("MCP-009: client cancellation aborts an in-flight stdio tool call", async () => {
  const client = createClient();
  await client.connect(createTransport());
  const abortController = new AbortController();
  const pending = client.callTool(
    { name: "web_search", arguments: { query: "cancel" } },
    { signal: abortController.signal },
  );
  setTimeout(() => abortController.abort(), 10);
  let cancelled = false;
  try {
    await pending;
  } catch {
    cancelled = true;
  }
  expect(cancelled).toBe(true);
  await client.close();
});

test("MCP-011: concurrent calls preserve JSON-RPC response correlation", async () => {
  const client = createClient();
  await client.connect(createTransport());
  const completionOrder: string[] = [];
  const slow = client
    .callTool({ name: "web_search", arguments: { query: "slow" } })
    .then((response) => {
      completionOrder.push("slow");
      return response;
    });
  const fast = client
    .callTool({ name: "web_search", arguments: { query: "fast" } })
    .then((response) => {
      completionOrder.push("fast");
      return response;
    });
  const [slowResult, fastResult] = await Promise.all([slow, fast]);
  expect(completionOrder).toEqual(["fast", "slow"]);
  expect(slowResult.content?.[0]).toMatchObject({ text: expect.stringContaining("slow") });
  expect(fastResult.content?.[0]).toMatchObject({ text: expect.stringContaining("fast") });
  await client.close();
});
