# WEB-005 — extractor registry, safe evidence, passages, and links

- Branch: `agent/web-005-a1`
- Worktree: `.worktree/web-005`
- Base: `5794e7d`
- Status: implemented and verified locally

## Design

`@/features/extraction` exposes one deterministic registry. It identifies MIME
from `Content-Type` plus the first 512 bytes and reports its extractor name and
version. It supports Obscura native rendered Markdown for HTML, text, Markdown,
JSON, XML, raw GitHub/public code, and a small textual-PDF path. The PDF path is
limited to literal text operations; non-text/scanned PDFs explicitly return
`unsupported_or_ocr_required`, consistent with SPK-005's Bun compatibility
finding and the no-OCR boundary. Images/audio/video return byte-bounded metadata.

Extraction consumes the rendering public seam for Markdown/text/links and the
security public seam for active-HTML removal and URL sanitization. The result
contains only external-untrusted text, code blocks, and link data; it never
evaluates text, code, or URLs. Fenced code is separate, carries language and
invisible-control warnings, and is never a passage instruction.

Markdown blocks preserve headings, paragraphs, lists/tables as text, and code.
Small blocks under a common heading are grouped rather than cut into character
windows. Query/focus lexical scoring chooses two heading-diverse passages by
default; `maxChars` increases the bounded passage count. Real heading-derived
fragments, optional document pages, and SHA-256 content hashes are emitted.
Content links (20) and navigation links (10) are distinct, sanitized data.

## Acceptance evidence

- `EXTRACT-001`: header/sniff detection covers HTML, text, Markdown, JSON, XML,
  raw GitHub code, and explicit unsupported formats.
- `EXTRACT-002/003`: textual PDF evidence, scanned-PDF OCR-required status, and
  image metadata prove no OCR, transcription, or media download path.
- `EXTRACT-004/005`: active/hidden HTML is stripped while prompt-injection text
  remains visible only as `external_untrusted` evidence and cannot invoke tools.
- `EXTRACT-006`: fenced TypeScript code remains separate with bidirectional
  control-character warning.
- `EXTRACT-009/010/012`: neighboring blocks group structurally; selected
  passages are diverse and have real fragment/page/content-hash values.
- `EXTRACT-011`: tracking and advertising links are removed and sanitized links
  are split into content and navigation lists.

## Gates

All passed: `bun run format`, `bun run lint`, `bun run lint:limits`, `bun run
lint:types`, `bun run typecheck`, `bun test --parallel --isolate`, and `bun run
check` (181 tests). No real network calls are made by the WEB-005 tests.

## Blockers

None.
