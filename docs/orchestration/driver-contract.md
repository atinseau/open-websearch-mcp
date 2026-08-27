# Minimal OpenCode controller contract

## Outcome

`BOOT-002` creates a small Bun entrypoint such as:

```text
bun run orchestrate
```

The command repeatedly invokes OpenCode with the user-selected powerful model,
persists each completed step, and resumes from repository state after a crash or
OpenCode context compaction.

## Responsibilities

The controller:

1. validates `state.toml`, the DAG, and task dependencies;
2. acquires one local controller lock;
3. selects one ready task;
4. creates or resumes its worktree under `.worktree/`;
5. starts OpenCode with an explicit cwd, model, prompt, and optional session ID;
6. captures the session ID, exit status, changed files, commands, and results;
7. writes a Markdown trace after each plan, implementation, verification,
   review, integration, failure, or blocker step;
8. validates tests and review verdicts before advancing state;
9. handles interruption by finishing the current trace and exiting resumably;
10. continues until completion, user pause, or a proven external blocker.

OpenCode provides native context management and compaction. The controller does
not reimplement model memory, token management, agent scheduling, or a generic
workflow engine.

## Execution Model

Only one implementation task is active. Subagents may perform
bounded parallel reads or reviews inside that task, but the controller does not
schedule independent worktrees.

Each OpenCode call has a timeout and returns a small structured result containing
status, task, session, changed paths, checks, findings, and next action. Free-form
text may explain the result but cannot replace failed checks.

## Resume

On startup the controller reads state, the latest task trace, Git status, and
the recorded worktree. It then either resumes the explicit OpenCode session or
starts a fresh session with the trace as durable context. It never depends on a
global conversational `--continue`.

## Non-goals

BOOT-002 does not provide:

- model benchmarking or automatic provider ranking;
- a multi-repository or reusable orchestration product;
- a custom security sandbox, capability broker, signing service, or relay;
- automatic branch protection, release credentials, or unrestricted GitHub
  mutation;
- cryptographic checkpoint chains or a second PR for every state update.

Normal process permissions, Git isolation, review, and project tests are the
appropriate controls for this local development loop.

## Bootstrap Acceptance

BOOT-002 includes focused tests below `scripts/orchestration/`. The bootstrap
validator checks its write set and persisted trace, runs
`scripts/orchestration/validate.ts`, then runs those tests. The PR receives the
normal fresh review described by the review protocol.
