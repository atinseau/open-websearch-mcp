import type {
  EvidenceCodeBlock,
  EvidenceResult,
  StructuredToolResult,
} from "@/features/investigation";

function localizer(item: { heading?: string; fragment?: string; document_page?: number }): string {
  return [
    item.heading && `heading=${item.heading}`,
    item.fragment && `fragment=${item.fragment}`,
    item.document_page !== undefined && `document_page=${item.document_page}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function renderCodeBlock(block: EvidenceCodeBlock): string {
  const fence = "`".repeat(
    Math.max(3, ...[...block.text.matchAll(/`+/gu)].map(([run]) => run.length + 1)),
  );
  const metadata = [
    `trust=${block.trust}`,
    `warnings=${JSON.stringify(block.invisible_character_warnings)}`,
    `content_hash=${block.content_hash}`,
    localizer(block),
  ]
    .filter(Boolean)
    .join("; ");
  return `[code_block ${metadata}]\n${fence}${block.language ?? ""}\n${block.text}\n${fence}`;
}

function renderResult(result: EvidenceResult): string {
  const metadata = [
    `title=${result.title}`,
    `url=${result.url}`,
    `final_url=${result.final_url}`,
    `discovery=${result.discovery}`,
    `source_type=${result.source_type}`,
    `mime_type=${result.mime_type}`,
    `published_at=${result.published_at ?? ""}`,
    `fetched_at=${result.fetched_at}`,
    `score=${result.score}`,
    `trust=${result.trust}`,
    `content_hash=${result.content_hash}`,
  ].join("; ");
  const passages = result.passages
    .map(
      (passage) =>
        `[passage score=${passage.score}; passage_hash=${passage.passage_hash}; ${localizer(passage)}]\n${passage.text}`,
    )
    .join("\n");
  const links = [
    ...result.content_links.map(
      (link) =>
        `[content_link title=${link.title}; url=${link.url}; context=${link.context ?? ""}]`,
    ),
    ...result.navigation_links.map(
      (link) => `[navigation_link title=${link.title}; url=${link.url}]`,
    ),
  ].join("\n");
  return [
    `[result ${metadata}]`,
    passages,
    result.code_blocks.map(renderCodeBlock).join("\n"),
    links,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Renders the complete portable fallback for clients that ignore structuredContent. */
export function renderCanonicalText(result: StructuredToolResult): string {
  const header = `[investigation_id=${result.investigation_id}; status=${result.status}; reason=${result.reason ?? ""}; confidence=${result.confidence}]`;
  const suggestions =
    result.suggested_queries
      ?.map((item) => `[suggested_query source=${item.source}] ${item.query}`)
      .join("\n") ?? "";
  return [header, result.results.map(renderResult).join("\n\n"), suggestions]
    .filter(Boolean)
    .join("\n\n");
}
