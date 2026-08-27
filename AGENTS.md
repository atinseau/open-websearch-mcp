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
