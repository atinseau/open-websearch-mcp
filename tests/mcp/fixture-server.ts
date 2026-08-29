import { serveStdio } from "@/mcp";
import type { McpToolAdapter } from "@/mcp";

const result = {
  investigation_id: "investigation-fixture",
  status: "success" as const,
  confidence: "high" as const,
  results: [
    {
      title: "Fixture evidence",
      url: "https://example.com/original",
      final_url: "https://example.com/final",
      discovery: "direct_open" as const,
      source_type: "article",
      mime_type: "text/html",
      fetched_at: "2026-08-29T00:00:00.000Z",
      score: 1,
      trust: "external_untrusted" as const,
      passages: [
        {
          text: "A source-located passage.",
          score: 1,
          heading: "Evidence",
          passage_hash: "passage-hash",
        },
      ],
      code_blocks: [
        {
          text: "const untrusted = true;",
          language: "ts",
          trust: "external_untrusted" as const,
          invisible_character_warnings: ["zero_width_space"],
          heading: "Example",
          content_hash: "code-hash",
        },
      ],
      content_links: [{ title: "Content", url: "https://example.com/content", context: "context" }],
      navigation_links: [{ title: "Navigation", url: "https://example.com/navigation" }],
      content_hash: "result-hash",
    },
  ],
};

const tools: McpToolAdapter = {
  webSearch: async (input, signal) => delayedResult(input.query, signal),
  webOpen: async (_input, _signal) => ({
    investigationId: result.investigation_id,
    structuredContent: result,
  }),
};

await serveStdio(tools);

async function delayedResult(query: string, signal: AbortSignal | undefined) {
  const delay = query === "slow" || query === "cancel" ? 100 : query === "fast" ? 5 : 0;
  if (delay) await waitFor(delay, signal);
  return {
    investigationId: result.investigation_id,
    structuredContent: {
      ...result,
      results: result.results.map((entry) => ({ ...entry, title: `${entry.title}: ${query}` })),
    },
  };
}

function waitFor(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}
