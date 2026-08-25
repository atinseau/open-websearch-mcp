# Worktree and PR protocol

## Ownership

The orchestrator alone creates/removes worktrees, pushes branches, opens PRs,
updates orchestration state, and merges. An implementer commits inside one
assigned worktree and never operates on `main` or another task branch.

## Bootstrap exception

When no repository exists, create the public repository and a root bootstrap
commit establishing `main`, committing the specification plus a minimal pinned
bootstrap validator and PR workflow. This is the sole
direct-main exception and prevents the first PR from depending on absent CI.
For BOOT-002, CI extracts and runs the validator from the immutable base `main`
SHA, never from PR-head code. It enforces the BOOT-002 write set, state/spec link
integrity, safe command manifest, and two independent review results tied to
sanitized OpenCode export hashes. Only after BOOT-002 merges may branch
protection promote its stronger audit as the required gate.
Apply every subsequent change through PRs. If GitHub or
npm authority is absent, record the external blocker; never create a substitute
account or remote.

## Creation

For ready task `<ID>`:

1. fetch and verify `origin/main`, clean repository, absent branch/path, and
   non-overlapping write set;
2. create branch `agent/<id-lowercase>-<slug>-a<attempt>` from current
   `origin/main`;
3. create a sibling worktree under one explicit worktree root, never under a
   broad home/root path;
4. persist branch, base SHA, path, lease/run ID, assigned agent/model, and write
   set in state before launching OpenCode;
5. start OpenCode with the worktree as cwd and explicit directory/session ID.

No two tasks write the same declared path. A contract change merges before
consumer work begins.

## Task branch

The branch contains one DAG task, its tests, required docs, and task-local
checkpoint proposal. Commits are reviewable and use stable requirement IDs.
Generated or raw benchmark artifacts follow their owning spec.

Before review, require clean status after commits, no unexpected files, no
secret scan findings, and all task gates. Before merge, update from latest main
without history destruction and rerun gates affected by the update.

## Pull request

The PR records task/spec IDs, base SHA, behavior delivered, excluded scope,
commands/results, spike/benchmark artifacts, automatic decisions/challenges,
known risks, and proposed checkpoint. Two independent agent review reports and
required CI statuses must be attached.

The mechanical audit in `audit-contract.md` verifies identities, evidence,
gates, and changed paths; Markdown declarations alone do not count.

The orchestrator merges automatically only when the review protocol says
`accept`, CI is green on current head, branch is current with main, and no
mandatory finding remains. It never force-pushes shared history or bypasses
branch protection.

## Cleanup and recovery

After merge, verify the task worktree is clean and commit reachable from main,
then use normal `git worktree remove` and prune metadata. Never use recursive
deletion, `git reset --hard`, or checkout-based discarding.

For expired/crashed work, archive status, diff, commits, OpenCode session export,
and logs before creating a replacement attempt. An absent process does not mean
the work is safe to delete.
