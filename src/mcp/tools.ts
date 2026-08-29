import type { CallContext } from "@/features/investigation";
import type { McpToolAdapter, McpToolDependencies } from "@/mcp";

function relayCancellation(context: CallContext, signal?: AbortSignal): () => void {
  if (!signal) return () => undefined;

  const cancel = () => context.abortController.abort(signal.reason);
  if (signal.aborted) cancel();
  signal.addEventListener("abort", cancel, { once: true });
  return () => signal.removeEventListener("abort", cancel);
}

async function withCall<Result>(
  dependencies: McpToolDependencies,
  signal: AbortSignal | undefined,
  operation: (context: CallContext) => Promise<Result>,
): Promise<Result> {
  const context = dependencies.calls.create();
  const stopRelaying = relayCancellation(context, signal);
  try {
    return await operation(context);
  } finally {
    stopRelaying();
  }
}

/** Creates the thin MCP boundary over the investigation application seam. */
export function createMcpToolAdapter(dependencies: McpToolDependencies): McpToolAdapter {
  return {
    webSearch: (input, signal) =>
      withCall(dependencies, signal, (context) =>
        dependencies.application.webSearch(input, context),
      ),
    webOpen: (input, signal) =>
      withCall(dependencies, signal, (context) => dependencies.application.webOpen(input, context)),
  };
}
