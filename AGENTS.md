# Agent routing

- For any product change, plan, or review, read [SPEC.md](SPEC.md), then every
  linked sub-spec that owns the affected requirement IDs.
- For autonomous implementation, worktree management, challenges, reviews,
  checkpoints, or resuming a previous run, start at
  [ORCHESTRATION.md](ORCHESTRATION.md) and the persisted orchestration state.
- Use the canonical terms in [CONTEXT.md](CONTEXT.md). Do not create synonyms
  for domain concepts in code or specifications.
- Treat `docs/spec/` as normative. Treat `docs/research/` as evidence, not as a
  source that can silently override an accepted requirement.
- Use Bun for project commands and runtime code. Product source imports Bun or
  Web-standard interfaces; it does not import Node interfaces directly.

