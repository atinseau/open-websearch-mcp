import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

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
