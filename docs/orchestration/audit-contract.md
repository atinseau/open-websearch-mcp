# Orchestration validation

The controller performs a small factual validation before a task advances. It
does not attempt to become a security boundary around OpenCode.

## Step Validation

For each recorded step, validate:

1. the task and attempt exist in `state.toml`;
2. the worktree is below `.worktree/` and belongs to the recorded branch;
3. changed paths are relevant to the task or explicitly explained;
4. commands record cwd, exit code, and concise output or artifact location;
5. required focused and full checks passed;
6. no obvious secret or generated-file leak is present;
7. review findings and the next action agree with the state transition.

Agent prose is useful context, not proof that a failing command passed.

## Task Completion

A task becomes `verified` when its implementation is integrated, required checks
pass, blocker/high review findings are closed, and its final trace identifies the
commit or PR plus relevant evidence. No separate checkpoint PR or cryptographic
session export is required.

Inside a PR, `verified` is a projected transition conditioned on that exact head
passing CI/review and merging unchanged. It becomes factual only when `main`
contains that SHA. Dependents are selected from factual `main` state, never from
an open PR.

## BOOT-002 Validation

The bootstrap validator checks that BOOT-002 stays within its declared paths,
provides the controller and state validator, writes a resumable progress trace,
then runs its validator and focused tests. Standard code review checks BOOT-002.
