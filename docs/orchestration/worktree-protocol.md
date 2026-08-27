# Worktree protocol

## Required Root

Every project worktree must live inside:

```text
open-websearch-mcp/.worktree/
```

Sibling worktree directories and broad temporary roots are forbidden. The
repository ignores `.worktree/`.

## Creation

For task `<ID>` and attempt `<N>`:

1. verify the main checkout and current base SHA;
2. create branch `agent/<id-lower>-a<n>`;
3. create `.worktree/<id-lower>-a<n>` with `git worktree add`;
4. record path, branch, base SHA, and OpenCode session in the first step trace;
5. start OpenCode with that worktree as cwd.

Only one implementation worktree is active. A task never writes in
another task's worktree or directly implements from the main checkout.

## Integration

Before integration, run required tests and any fresh review required by the
review protocol, commit intended files, and use the normal PR/CI path. The trace
records the PR and final commit when available. `main` remains the release source.

## Cleanup

After merge or an explicit abandonment decision:

1. record the final status and any useful diff or commit in the task trace;
2. verify no unrecorded user work would be lost;
3. run `git worktree remove` on the exact `.worktree/` path;
4. prune worktree metadata and delete the task branch only when safe.

Never use broad recursive cleanup, `git reset --hard`, or deletion outside
`.worktree/` as part of normal orchestration.
