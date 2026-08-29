import type { McpToolAdapter } from "@/mcp";

const result = {
  investigation_id: "release-fixture",
  status: "success" as const,
  confidence: "high" as const,
  results: [
    {
      title: "Release fixture evidence",
      url: "https://example.com/release-fixture",
      final_url: "https://example.com/release-fixture",
      discovery: "direct_open" as const,
      source_type: "article",
      mime_type: "text/html",
      fetched_at: "2026-08-29T00:00:00.000Z",
      score: 1,
      trust: "external_untrusted" as const,
      passages: [
        {
          text: "Fixture-backed evidence proves the packaged MCP transport.",
          score: 1,
          heading: "Release smoke test",
          passage_hash: "release-fixture-passage",
        },
      ],
      code_blocks: [],
      content_links: [],
      navigation_links: [],
      content_hash: "release-fixture-result",
    },
  ],
};

/** A deterministic adapter used only by the packed-artifact release smoke test. */
export function createReleaseFixtureTools(): McpToolAdapter {
  return {
    webSearch: async () => ({
      investigationId: result.investigation_id,
      structuredContent: result,
    }),
    webOpen: async () => ({
      investigationId: result.investigation_id,
      structuredContent: result,
    }),
  };
}
