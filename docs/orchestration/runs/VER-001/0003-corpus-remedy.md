# VER-001 corpus remedy assessment

- Date: `2026-08-29`
- Branch/worktree: `agent/gap-teacher-a1`, `.worktree/gap-teacher`; base `1bf4445`.
- Goal: close the release-readiness finding that the Codex-only teacher corpus
  has no URL-located passages, without weakening the deterministic benchmark.

## Reconciled evidence

- Read `AGENTS.md`, `SPEC.md`, `CONTEXT.md`, `ORCHESTRATION.md`, state, the
  prior VER-001 traces, ADR-0006, ADR-0010, SPK-004, SPEC-09, requirements
  `TEST-005..019`, the teacher corpus/auditor, and the deterministic grader.
- The sealed `2026-08-28` refresh has 20 cases, 18 accepted Codex-grounded
  claims in 10 cases, and zero teacher URL-located evidence passages. Its
  existing deterministic report is therefore correctly unmeasurable.
- A local trial rendered the Codex-cited `https://bun.sh/docs/runtime/webview`
  with Obscura `0.2.1`. Obscura native Markdown contained structured content.
  Sending that Markdown directly to the extractor as Markdown yielded
  source-located heading/fragment/hash passages; this proves only that a
  product-derived diagnostic could be made, not teacher evidence.
- The actual runtime `web_open` extraction adapter supplies rendered text plus
  Markdown while labelling the input `text/html`. The HTML sanitizer flattens
  native Markdown headings; the cited Bun page then has one over-limit block
  and returns zero passages. Thus `web_open` itself is not currently the
  proposed passage-exposing capture surface.
- `pgrep` found one pre-existing Obscura service owned by a different
  verification workspace. The trial used only one-shot `obscura fetch` children
  and left no additional service process.

## Decision

No derived refresh was sealed, no existing refresh was changed, and no grader
weights, thresholds, or promotion logic changed. ADR-0011 records why using
the product extractor to manufacture expected passages is self-referential for
extraction quality and why the actual runtime path currently cannot supply the
proposed artifact anyway.

The resulting real `TEST-015` report remains the checked-in source-only
mechanics probe: evidence coverage `0` where claims exist; source recall/rank,
diversity, and budget have their recorded component values; extraction and
every total are `unmeasurable`. Under `TEST-016`, every case remains
`unmeasurable`; under `TEST-017`, promotion remains refused. This is a blocker,
not a low score to tune away.

## Files changed

- `docs/adr/0011-reject-self-referential-passage-derived-teacher-refresh.md`
- `docs/orchestration/runs/VER-001/0003-corpus-remedy.md`

## Next action

Retain ADR-0010 release deferral. If an independently passage-exposing teacher
or capture surface becomes available, define its immutable provenance and
fixture contract before collecting a new dated refresh; separately repair
runtime Markdown/HTML passage handling through normal product work.
