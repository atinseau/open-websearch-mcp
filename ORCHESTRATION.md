# OpenCode implementation loop

## Owned Requirements

This contract owns `ORCH-009` through `ORCH-013`. Their atomic acceptance
criteria and dependencies are registered in `docs/spec/requirements.md`.

## Purpose

Use one powerful OpenCode model to drive the project from the specification to
completion. The loop exists to preserve direction across long runs and context
compaction, not to build a generic agent platform.

The controller may use OpenCode subagents for bounded research, implementation,
or review. OpenCode owns context compaction. Repository traces preserve the
facts needed to resume without relying on conversation memory.

## Principles

- Work on exactly one DAG task at a time.
- Keep the controller on a strong model selected by the user at runtime.
- Start fresh role sessions when implementation or review benefits from a clean
  context; a model roster or calibration system is not required.
- Record a Markdown trace after every meaningful step before continuing.
- Trust source files, Git, commands, tests, and recorded artifacts over prose.
- Prefer the smallest implementation that satisfies the current task.
- Do not create security infrastructure, native brokers, signing ceremonies, or
  generic orchestration frameworks unless a product requirement explicitly
  needs them.

## Required Reading

At the beginning of a run, after compaction, or when resuming:

1. Read `AGENTS.md`, `SPEC.md`, and `CONTEXT.md`.
2. Read `docs/orchestration/state.toml`.
3. Read `docs/orchestration/dag.md` and the sub-spec owned by the current task.
4. Read the latest trace under `docs/orchestration/runs/<task-id>/`.
5. Inspect Git status, branches, PR state when relevant, and `.worktree/`.

## Control Loop

Repeat until the product definition of done is proven:

1. **Reconcile.** Compare state and the latest trace with Git and test facts.
2. **Select.** Pick the first dependency-complete task. Do not start parallel
   implementation merely to increase throughput.
3. **Prepare.** Create one worktree under `.worktree/<task-id>-a<attempt>` and
   record its branch, base SHA, goal, and session in the task trace.
4. **Implement.** Let the controller or a fresh implementation session make the
   smallest complete change and run focused checks regularly.
5. **Verify.** Run the task's full declared checks. A failed check returns to
   implementation; it is never converted into success by explanation.
6. **Review.** Use a fresh OpenCode session for a concise spec and quality review
   of substantial changes. Repair blocker/high findings before integration.
7. **Trace.** Write the step result, files, commands, decisions, open questions,
   and exact next action before the controller continues or compacts.
8. **Integrate.** After checks and review, commit a projected `verified` state in
   the PR. Merge makes that state factual for the exact reviewed SHA; reconcile
   it from `main`, then remove the worktree safely.
9. **Continue.** Re-read state and the latest trace, then select the next task.

## Persistence

`docs/orchestration/state.toml` stores compact machine-readable progress.
`docs/orchestration/runs/<task-id>/NNNN-<step>.md` stores the human- and
agent-readable history. Each trace includes:

- task, attempt, branch/worktree, base/head SHA, OpenCode session;
- goal and completed work;
- files changed;
- commands and outcomes;
- decisions and reasons;
- unresolved findings or blockers;
- the exact next action.

Write traces atomically. Existing traces are historical facts and should not be
silently rewritten; add a correction step when needed.

## Stop Conditions

The loop stops only when:

- every mandatory requirement is verified and final checks pass;
- the user pauses or redirects the work; or
- an exact external dependency or permission prevents all useful progress.

Difficulty, a failed approach, test failures, or context compaction are not
terminal conditions. Record the failure, choose a different approach, and
continue.

## Scope Of BOOT-002

`BOOT-002` implements this small local loop, state validation, trace writing,
resume behavior, and worktree discipline. It does not implement product runtime
behavior and is not a reusable orchestration product.
