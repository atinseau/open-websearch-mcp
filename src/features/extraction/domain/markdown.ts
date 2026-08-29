export interface ContentBlock {
  readonly text: string;
  readonly heading?: string;
  readonly headingPath?: readonly string[];
  readonly fragment?: string;
  readonly code?: { readonly language?: string; readonly text: string };
}

/** Parses the safe structural subset produced by Obscura's native Markdown dump. */
export function markdownBlocks(markdown: string): readonly ContentBlock[] {
  const output: ContentBlock[] = [];
  const lines = markdown.replace(/\r/g, "").split("\n");
  let heading: string | undefined;
  let headingPath: readonly string[] | undefined;
  for (let index = 0; index < lines.length;) {
    const line = lines[index]?.trim() ?? "";
    const matchedHeading = line.match(/^(#{1,6})\s+(.+)$/);
    if (matchedHeading) {
      heading = matchedHeading[2]?.trim();
      headingPath = updateHeadingPath(headingPath, matchedHeading[1]?.length ?? 1, heading);
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code = readCode(lines, index, heading, headingPath);
      output.push(code.block);
      index = code.next;
      continue;
    }
    if (line) {
      const paragraph = readParagraph(lines, index);
      output.push({ text: paragraph.text, heading, headingPath, fragment: fragment(heading) });
      index = paragraph.next;
      continue;
    }
    index += 1;
  }
  return output;
}

function readCode(
  lines: readonly string[],
  index: number,
  heading: string | undefined,
  headingPath: readonly string[] | undefined,
): { readonly block: ContentBlock; readonly next: number } {
  const first = lines[index]?.trim() ?? "";
  const language = first.slice(3).trim() || undefined;
  const values: string[] = [];
  let cursor = index + 1;
  while (cursor < lines.length && !(lines[cursor]?.trim().startsWith("```") ?? false)) {
    values.push(lines[cursor] ?? "");
    cursor += 1;
  }
  return {
    block: {
      text: values.join("\n"),
      heading,
      headingPath,
      fragment: fragment(heading),
      code: { language, text: values.join("\n") },
    },
    next: Math.min(cursor + 1, lines.length),
  };
}

function updateHeadingPath(
  path: readonly string[] | undefined,
  level: number,
  heading: string | undefined,
): readonly string[] {
  const next = (path ?? []).slice(0, level - 1);
  if (heading) next.push(heading);
  return next;
}

function readParagraph(
  lines: readonly string[],
  index: number,
): { readonly text: string; readonly next: number } {
  const values: string[] = [];
  let cursor = index;
  while (cursor < lines.length && isContentLine(lines[cursor] ?? "")) {
    values.push(lines[cursor]?.trim() ?? "");
    cursor += 1;
  }
  return { text: values.join("\n"), next: cursor };
}

function isContentLine(line: string): boolean {
  return Boolean(line.trim()) && !/^#{1,6}\s|^```/.test(line.trim());
}

function fragment(heading: string | undefined): string | undefined {
  if (!heading) return undefined;
  return `#${heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")}`;
}
