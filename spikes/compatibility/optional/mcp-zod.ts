import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const server = new McpServer({ name: "spk-005", version: "0.0.0" });
const schema = z.object({ query: z.string().min(1) });
const parsed = schema.parse({ query: "compatibility" });

if (server === undefined || parsed.query !== "compatibility") {
  throw new Error("Official MCP SDK or Zod did not initialize under Bun");
}
console.log(JSON.stringify({ candidates: ["@modelcontextprotocol/server", "zod"], result: "initialized" }));
