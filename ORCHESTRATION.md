# Autonomous implementation orchestration

## Mission

Implement every mandatory requirement reachable from [SPEC.md](SPEC.md) through
an autonomous OpenCode run. The orchestrator coordinates agents; it does not
write feature code. Progress is reconstructed from Git, PRs, the task manifest,
and immutable checkpoints rather than conversation memory.

The loop is completion-driven, not literally infinite. A failed approach causes
challenge, replanning, stronger-model escalation, or replacement. It never
marks incomplete work complete and never spins the same attempt indefinitely.
Only a missing external authority such as GitHub/npm authentication may end the
run as `blocked`; independent branches continue first.

## Required reading order

1. Read [SPEC.md](SPEC.md) and [CONTEXT.md](CONTEXT.md).
2. Read `docs/orchestration/state.toml` and the latest checkpoint.
3. Read [the DAG](docs/orchestration/dag.md) and only the sub-specs owned by the
   current frontier tasks.
4. Load the specialized policy when its branch fires:
   - model discovery or assignment → [model routing](docs/orchestration/model-routing.md);
   - starting, supervising, or resuming the one-shot loop → [driver contract](docs/orchestration/driver-contract.md);
   - state, leases, transitions, or proof → [state schema](docs/orchestration/state-schema.md) and [mechanical audit](docs/orchestration/audit-contract.md);
   - worktree, branch, PR, or integration → [worktree protocol](docs/orchestration/worktree-protocol.md);
   - proposal, challenge, or review → [review protocol](docs/orchestration/review-protocol.md);
   - progress persistence or resume → [checkpoint protocol](docs/orchestration/checkpoint-protocol.md).

## Bootstrap

Before product work:

1. Verify the directory is a Git repository with `main` and a GitHub `origin`.
   If it is not, execute task `BOOT-001` from the DAG. The root bootstrap commit
   establishes `main`, commits this specification, and installs the minimal
   orchestration-audit PR workflow; every subsequent change uses a PR.
2. Verify `gh` authentication, OpenCode provider authentication, Codex/Claude
   teacher availability, Bun, and macOS ARM64. Record failures without hiding
   them and continue tasks that do not require the missing authority.
3. Run `opencode models` and the available-agent inspection described by the
   model-routing policy. Persist the roster; never hardcode model names in this
   document.
4. Reconcile `state.toml` against merged PRs, open PRs, worktrees, and
   checkpoints. Git/PR evidence wins over stale state.
5. Compute the ready frontier: tasks whose dependencies are all `verified` and
   whose declared write sets do not overlap.

OpenCode does not itself guarantee a durable multi-worktree loop. `BOOT-002`
therefore establishes the Bun orchestration driver defined by the driver
contract. The initial primary session bootstraps that driver, then the driver
owns repeated OpenCode invocations and recovery until a terminal state.

## State machine

Each task transitions through:

```text
planned → ready → challenged → claimed → implementing → reviewing
                 ^                           |             |
                 └──── replan / repair ──────┴─────────────┘
                                                             \
                                                              → integrated_pending_checkpoint
                                                                → verified
                                                              → blocked_external
```

`integrated_pending_checkpoint` means the task PR is merged and accepted, but
dependents remain closed. `verified` additionally requires its finalized
checkpoint transaction and committed state snapshot. `blocked_external` requires a falsifiable missing
permission/credential/upstream capability and a minimal handoff. Difficulty,
test failure, disagreement, or an exhausted approach is not an external block.

## Main loop

Repeat these steps until the project definition of done is proven:

1. **Reconcile.** Refresh `main`, PR status, state, leases, and evidence. Archive
   abandoned diffs before replacing a worktree.
2. **Select.** Choose the non-overlapping ready frontier. Prefer tasks that
   unlock the most downstream requirements and spikes that remove uncertainty.
3. **Propose.** Assign an implementer to write a bounded plan, affected
   requirement IDs, tests, write set, assumptions, and completion evidence.
4. **Challenge.** Assign an independent, sufficiently capable model to attack
   the plan. Resolve every contract-affecting objection before code is written.
5. **Implement.** Create a task worktree/branch, implement the smallest complete
   increment, and run its local gates. The implementer updates no global state.
6. **Review.** Run independent spec-compliance and quality/security reviews.
   Findings return to implementation; repeated disagreement escalates to a
   stronger independent arbiter with the original evidence.
7. **Verify.** Reproduce the gates from a clean verification worktree. Generated
   claims without command output or artifacts do not count as evidence.
8. **Integrate.** Open/update the single-purpose PR, wait for CI, merge only when
   current with `main`, then delete the task worktree safely.
9. **Checkpoint.** Move the source task to `integrated_pending_checkpoint`, then
   open its schema-governed checkpoint transaction PR. Mechanical audit verifies
   merge SHA, append-only chain, evidence hashes, and state delta. Merge it to
   mark the task `verified`, then recompute the frontier.
10. **Audit completion.** When no ready task remains, run the traceability and
    release audit. If any required ID lacks evidence, create repair tasks and
    continue the loop.

## Decision discipline

- A specified choice is implemented, not reopened because an agent prefers an
  alternative.
- A new reversible implementation choice is proposed with evidence and receives
  one independent challenge before acceptance.
- Security, public interfaces, persistence, concurrency, dependencies, and
  release decisions receive two independent challenges and an arbiter when they
  conflict.
- An agent may propose a spec amendment but cannot merge it together with the
  implementation that depends on it. The amendment is reviewed as its own PR and
  must preserve the master outcome and invariants.
- Three failed versions of the same approach trigger redesign and model
  escalation. They do not permit weakening a gate or declaring the task blocked.

## Agent independence

The plan author, implementer, spec reviewer, and quality reviewer are separate
agent identities. For high-risk tasks, the challenger/reviewer uses a different
model family when the roster permits it. Reviewers receive the spec, diff, and
test evidence, not the implementer's persuasive narrative.

## Persistence and recovery

`docs/orchestration/state.toml` is the current machine-readable state.
Checkpoints are append-only historical proof. Runs and model rosters are
versioned artifacts. On restart or compaction, the orchestrator reads these
files and GitHub state before issuing new work. It never infers task completion
from an absent worktree or a previous chat statement.

## Terminal states

`complete` is legal only when SPEC's product definition of done and every
sub-spec acceptance criterion pass. `blocked_external` is legal only after all
independent work is complete and the remaining requirement names the exact
external action required. There is no `best_effort_complete`, skipped mandatory
task, or release with waived benchmark/security gates.
