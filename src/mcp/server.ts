import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import type { McpToolAdapter } from "@/mcp";
import {
  MAX_INBOUND_MESSAGE_BYTES,
  structuredToolResultSchema,
  webOpenInputSchema,
  webSearchInputSchema,
} from "@/mcp/contracts";
import { renderCanonicalText } from "@/mcp/serialize";

const protocolVersions = ["2025-06-18", "2024-11-05"];

function internalError() {
  return {
    investigation_id: "internal-error",
    status: "error" as const,
    reason: "internal_error" as const,
    confidence: "low" as const,
    results: [],
  };
}

function resultFor(result: Awaited<ReturnType<McpToolAdapter["webSearch"]>>) {
  let structuredContent;
  try {
    structuredContent = structuredToolResultSchema.parse(result.structuredContent);
  } catch {
    structuredContent = internalError();
  }
  return {
    content: [{ type: "text" as const, text: renderCanonicalText(structuredContent) }],
    structuredContent,
  };
}

/** Creates the official SDK server; only the two v1 research tools are registered. */
export function createMcpServer(tools: McpToolAdapter): McpServer {
  const server = new McpServer(
    { name: "open-websearch-mcp", version: "0.0.0" },
    { capabilities: { tools: {} }, supportedProtocolVersions: protocolVersions },
  );
  server.registerTool(
    "web_search",
    {
      description: "Discover public Web evidence for an investigation.",
      inputSchema: webSearchInputSchema,
      outputSchema: structuredToolResultSchema,
    },
    async (input, context) => {
      try {
        return resultFor(
          await tools.webSearch(
            {
              query: input.query,
              investigationId: input.investigation_id,
              maxResults: input.max_results,
              profile: input.profile,
              locale: input.locale,
            },
            context.mcpReq.signal,
          ),
        );
      } catch {
        return resultFor({ investigationId: "internal-error", structuredContent: internalError() });
      }
    },
  );
  server.registerTool(
    "web_open",
    {
      description: "Open exactly one public URL for evidence.",
      inputSchema: webOpenInputSchema,
      outputSchema: structuredToolResultSchema,
    },
    async (input, context) => {
      try {
        return resultFor(
          await tools.webOpen(
            {
              url: new URL(input.url),
              investigationId: input.investigation_id,
              focus: input.focus,
              maxChars: input.max_chars,
            },
            context.mcpReq.signal,
          ),
        );
      } catch {
        return resultFor({ investigationId: "internal-error", structuredContent: internalError() });
      }
    },
  );
  return server;
}

/** Starts stdio with a bounded inbound buffer; stdout remains SDK-owned MCP frames only. */
export async function serveStdio(
  tools: McpToolAdapter,
  maxInboundMessageBytes = MAX_INBOUND_MESSAGE_BYTES,
): Promise<void> {
  await createMcpServer(tools).connect(
    new StdioServerTransport(undefined, undefined, { maxBufferSize: maxInboundMessageBytes }),
  );
}
