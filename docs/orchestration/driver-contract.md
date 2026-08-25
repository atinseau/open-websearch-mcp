# Durable orchestration driver contract

## Why a driver exists

OpenCode 1.18.23 can run agents, models, JSON sessions, and subagents, but it has
no native worktree scheduler or guarantee that one conversational turn will
continue until a multi-PR project is complete. A small Bun driver supplies
durability and policy enforcement; OpenCode models supply planning,
implementation, challenge, review, and verification.

The driver is orchestration infrastructure, not product runtime. It does not
decide product behavior or generate code.

## One-shot entrypoint

`BOOT-002` must create one documented Bun command such as:

```text
bun run orchestrate
```

Running it acquires a single-repo lease, reconciles state, and continues until
`complete` or `blocked_external`. A crash or machine restart is recovered by
running the same command again. A second concurrent driver exits without
changing state.

## Responsibilities

The driver alone:

1. reads/validates specs, DAG, state schema, checkpoint chain, and model roster;
2. queries OpenCode version/models/agents and runs required capability probes;
3. computes ready non-overlapping task waves;
4. creates/leases/archives worktrees using the worktree protocol;
5. invokes `opencode run --format json` with explicit agent/model/variant/cwd,
   per-step timeout, task prompt, and never global `--continue`;
6. captures exit status, JSON events, session ID, token/cost metadata, diff, and
   artifacts, then exports/sanitizes consequential sessions;
7. validates proposed state transitions rather than trusting an agent's
   `complete` message;
8. runs challenges, reviews, verification, PR/CI integration, checkpoints, and
   escalation according to their protocols;
9. handles SIGINT/SIGTERM by stopping new work, cancelling children, persisting
   state, and leaving worktrees recoverable;
10. emits a concise progress heartbeat without page/user secrets.

The process implements a concrete reconcile/dispatch/wait cycle. It launches
independent ready attempts with `Bun.spawn`, awaits their JSON streams
concurrently, validates each terminal object, and persists state after every
ownership-changing event. Agent timeout defaults to 30 minutes, CI polling to
30 seconds with capped five-minute backoff, and provider retry to three
transient attempts; all are configurable. Child exit `0` still requires schema
and audit success. Driver exits `0` only for verified `complete`, `20` for
proven `blocked_external`, `30` when safely interrupted/resumable, and nonzero
`4x/5x` for external/internal faults handled by the same idempotent resume.

Every child and verification command passes through the capability executor
defined by the mechanical audit. Agent-proposed argv is data, never authority.
The driver rejects undeclared executables, transitive package scripts, roots,
network classes, credential reads, GitHub writes, and publication operations
before spawn. BOOT-002 must prove its macOS sandbox with read/write/network/
process escape fixtures; failure prevents agent implementation from starting.

## State durability

In-flight state is written atomically under:

```text
~/.open-websearch-mcp/orchestration/<repo-id>/
├── state.toml
├── lease.toml
├── sessions/
├── raw-logs/
└── archives/
```

The versioned `docs/orchestration/state.toml` is the latest checkpoint snapshot,
not a lock file. At each merged checkpoint, sanitize and commit the state
snapshot. If local state disappears, reconstruct it from main, checkpoints,
open/merged PRs, branches, worktrees, and CI; uncertain work returns to review,
not silently to verified.

## Structured agent results

Every agent invocation must produce a schema-validated result for its role:
task/attempt, verdict or status, requirement IDs, changed paths, commands and
exit codes, artifact paths/hashes, decisions/findings, session ID, and requested
next transition. Free-form prose may accompany this object but cannot mutate
state.

All attempts use the versioned prompt/result envelope and explicit OpenCode
session ID. Parallel output is written to attempt-specific files, never
interleaved on stdout. Requested transitions remain proposals until
`bun run orchestration:audit` accepts them independently.

## Liveness without spinning

Each invocation has timeout, cancellation, and an approach fingerprint. Three
failures with the same fingerprint force a different plan/model/implementation
strategy. Repeated infrastructure flakiness applies bounded retry/backoff.
There is no project-wide attempt budget that permits incomplete termination.

When no task is ready, the driver proves one of three conditions:

- all mandatory tasks verified → run final audits;
- dependencies are in active/review/CI states → wait with bounded polling;
- an exact external authority blocks every remaining path → create the blocker
  checkpoint.

Any other empty frontier is a DAG/state defect and creates an orchestration
repair task.

CI attempts have a 45-minute default absolute deadline persisted in state.
During it the driver snapshots check state and may request one rerun only when
the provider reports a completed/retriable infrastructure failure. At deadline,
it diagnoses whether workflow/configuration is internal (create a repair task)
or GitHub/runner authority is externally unavailable. It then records
`blocked_external` after independent work completes; it never polls a pending
check without an absolute horizon.

## Safety

The driver uses explicit validated paths and arguments, never shell interpolation
of agent/page content. Model agents receive minimal permissions. Publishing,
branch-protection changes, credentials, and destructive cleanup are unavailable
until their authorized task. Driver tests simulate crashes, duplicated starts,
malformed model output, hung agents, stale leases, conflicting write sets,
failed CI, and partial GitHub outages.
