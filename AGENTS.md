# Agent routing

- For any product change, plan, or review, read [SPEC.md](SPEC.md), then every
  linked sub-spec that owns the affected requirement IDs.
- For autonomous implementation or resuming after OpenCode compaction, read
  [ORCHESTRATION.md](ORCHESTRATION.md), the persisted state, and the latest task
  trace. Use only `.worktree/` for project worktrees.
- Use the canonical terms in [CONTEXT.md](CONTEXT.md). Do not create synonyms
  for domain concepts in code or specifications.
- Treat `docs/spec/` as normative. Treat `docs/research/` as evidence, not as a
  source that can silently override an accepted requirement.
- Use Bun for project commands and runtime code. Product source imports Bun or
  Web-standard interfaces; it does not import Node interfaces directly.

## Delivery status

Read [docs/orchestration/state.toml](docs/orchestration/state.toml) for the
authoritative task graph. This section is the fast orientation; state.toml wins
on any disagreement.

Verified: `BOOT-001..004`, `SPK-001..005`, `FND-001`.

The product is a local-first MCP server exposing exactly two tools,
`web_search` and `web_open`, over stdio. It contains no LLM and calls no search
API. Google front-end pages provide discovery, Obscura provides rendering, and
extraction, ranking, caching, and investigation memory are deterministic.

## Standing decisions that constrain new work

These are accepted decisions, not open questions. Do not relitigate them
without a new ADR.

- [ADR-0006](docs/adr/0006-codex-only-teacher-with-deterministic-grounding.md):
  one Codex teacher, verified by a deterministic grounding check. The corpus is
  small on purpose. `VER-001` must revisit this before the teacher benchmark
  gates a release.
- [ADR-0007](docs/adr/0007-defer-mechanical-feature-boundary-enforcement.md):
  feature-boundary enforcement is deferred, so `ARCH-002` is upheld by
  structure and review. `tests/architecture/dependency-graph.test.ts` is the
  only automated check of the architectural shape — extend it when adding
  features, never weaken it.
- [ADR-0008](docs/adr/0008-scope-arch-007-limits-to-product-source.md):
  `ARCH-007` numeric limits apply to `src` via `src/.oxlintrc.jsonc`.
  `scripts/` and `benchmarks/` are recorded debt, not exempt.
- [ADR-0009](docs/adr/0009-delegate-renderer-network-enforcement-to-pinned-obscura.md):
  Obscura `0.2.1` enforces renderer DNS/redirect public-network controls;
  rerun its adversarial integration test before accepting any pin change.
- `SPK-002` selected exactly one `Bun.WebView` renderer bound to an explicitly
  owned Obscura CDP endpoint. Production never ships the fallback CDP path too.
- `SPK-003` calibrated the scheduler. Consume
  `docs/spikes/SPK-003/controller-fixture.json`; never invent thresholds.
- `SPK-004` adopted no extractor. Obscura native Markdown is the baseline until
  a measured gap justifies a candidate.

## Non-negotiable working rules

- Never report an unenforced rule as green, and never weaken a gate to make it
  pass. Record the gap instead.
- Credential-shaped test fixtures are assembled at runtime, never committed as
  literals; GitHub push protection rejects the literals.
- Every task runs in its own `.worktree/` branch, passes `bun run check`, and
  reaches `main` through a reviewed pull request (`PROD-009`).

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `atinseau/open-websearch-mcp`, via the `gh`
CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label named after its role. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. The routing
rules above stay authoritative for product work; this section only tells the
engineering skills where to look. See `docs/agents/domain.md`.

