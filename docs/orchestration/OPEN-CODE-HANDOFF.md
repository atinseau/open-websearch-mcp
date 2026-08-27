# OpenCode implementation handoff

Use the powerful model configured by the user as the project controller.

1. Read `AGENTS.md`, `SPEC.md`, `ORCHESTRATION.md`, `state.toml`, the current
   task's sub-spec, and its latest Markdown trace.
2. Reconcile those records with Git and `.worktree/`.
3. Work on one dependency-complete task at a time.
4. Use `.worktree/<task-id>-a<attempt>` for implementation.
5. Let OpenCode manage context and auto-compaction natively.
6. Persist a concise trace after every plan, implementation, test, review,
   integration, failure, pause, or blocker step.
7. Use fresh sessions for substantial implementation or review when useful.
8. Advance only when tests and required review pass.
9. Continue until the product definition of done, user pause, or a proven
   external blocker.

Start with `BOOT-002`: implement only the minimal Bun control loop, state
validation, trace persistence, resume behavior, and `.worktree/` discipline.
Do not turn it into a generic orchestrator or security product.
