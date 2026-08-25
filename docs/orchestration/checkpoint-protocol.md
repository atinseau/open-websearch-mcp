# Checkpoints and recovery

## Sources of truth

- Git/GitHub establish code, commits, branches, PRs, and CI facts.
- the atomic runtime state under `~/.open-websearch-mcp/orchestration/<repo-id>`
  establishes in-flight scheduler state and leases;
- versioned `state.toml` is the latest checkpoint snapshot and reconstruction
  baseline.
- append-only checkpoint Markdown establishes why a transition was accepted.
- sanitized OpenCode exports/logs support diagnosis but never override Git or
  normative specs.

## When to checkpoint

Create an immutable checkpoint after each merged task, accepted spec amendment,
release, or proven external block. During long spikes, intermediate checkpoints
may record reproducible measurements but do not mark the task verified.

Path: `docs/orchestration/checkpoints/NNNN-<task-id>-<slug>.md`.

Every checkpoint contains commit/main SHA, task/spec/requirement IDs, previous
checkpoint, PR, agent/model/variant/session IDs, delivered and excluded scope,
changed public interfaces, decisions/challenges, review outcomes, exact gates
and artifact paths/hashes, residual risks, state transition, and newly ready
tasks.

Claims such as "tests pass" without a command, exit status, and reproducible
artifact do not count.

## Atomic state updates

After a task merge, mark it `integrated_pending_checkpoint`, reconcile actual
GitHub state, write a temporary next runtime state, validate its schema and DAG
invariants, then rename atomically. A driver-created checkpoint transaction
(`checkpoint/<task>-<attempt>`) is a first-class orchestration PR with the source
merge SHA, finalized checkpoint, and sanitized state snapshot. It has a fixed
write set, independent review, and the mechanical audit gate. Its merge is the
only transition to `verified`; dependents wait for it.

Never rewrite a previous checkpoint. Corrections create a new checkpoint that
links and supersedes the mistaken claim.
CI hashes the chain from the PR base, forbids prior checkpoint modification or
deletion, requires exactly the next sequence number, and validates `previous`.

## Resume algorithm

On every fresh OpenCode session or compaction:

1. read SPEC, ORCHESTRATION, state, and latest checkpoint;
2. fetch main and list merged/open PRs, branches, worktrees, and CI;
3. compare those facts to every non-terminal task;
4. archive orphan diffs/session exports and expire stale leases safely;
5. repair state through a reviewed reconciliation change;
6. compute the ready frontier and continue.

Never use `opencode --continue` globally. Resume only a checkpoint-recorded
session ID in its recorded worktree, or start a clean session from spec and
checkpoint.

## External blockers

A blocker checkpoint must name the exact unavailable authority/capability,
commands and errors, three materially different attempted routes when safe,
all independent work completed, and the smallest external action required.
Implementation bugs, failed tests, difficult design, and provider/model
disagreement are not external blockers.
