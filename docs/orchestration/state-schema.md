# Orchestration state schema

## Purpose

`docs/orchestration/state.toml` is a compact index of project progress. Detailed
history belongs in Markdown traces, not in a large scheduler database.

## Project Fields

The root records:

- schema version, project, overall state, spec revision;
- current task and latest trace when work is active;
- controller model selected at runtime;
- simple retry and worktree policy;
- task definitions and evidence paths.

## Task Fields

Tasks are TOML tables keyed by task ID. Every task records:

```text
state, spec, depends_on, write_set, evidence
```

`requirements`, `acceptance_gates`, and `attempts` are optional until the task is
prepared for execution. Unknown fields are rejected so stale or misspelled state
does not silently drive the loop.

## States

Task states are:

```text
planned -> ready -> in_progress -> review -> verified
                              \-> blocked_external
```

A failed implementation remains `in_progress`; its trace records the failure and
next approach. A user pause leaves state unchanged and records a pause step.

Only one task may be `in_progress` or `review`. Dependencies must be `verified`
before a task becomes `ready`.

An integration PR may contain its projected `verified` state after all local
checks and review pass. That state becomes factual only when the exact PR head is
merged to `main`; open-PR state never makes a dependent task ready.

## Atomic Updates

After every meaningful step, write the new trace first, then atomically replace
`state.toml` with a version pointing to that trace. On resume, Git facts and the
latest trace correct stale state.

## Commands

BOOT-002 provides Bun commands equivalent to:

```text
bun run orchestration:validate
bun run orchestrate
```

Validation covers TOML shape, DAG cycles, dependencies, the one-active-task
rule, worktree confinement, and referenced trace existence.
