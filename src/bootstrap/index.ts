import type { McpToolAdapter, McpToolDependencies } from "@/mcp";
import { createMcpToolAdapter } from "@/mcp/tools";

/** Composition root; future infrastructure is assembled here, not in features. */
export function composeMcpTools(dependencies: McpToolDependencies): McpToolAdapter {
  return createMcpToolAdapter(dependencies);
}
