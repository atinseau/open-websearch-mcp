# Orchestration state schema

## Version and authorities

Schema version `2` separates the committed reconstruction snapshot from the
atomic runtime state described by the driver contract. The driver validates both
with Zod before use. Unknown fields fail; migrations write a backup and atomic
replacement. Git/GitHub facts override stale task claims, never normative specs.

## Project snapshot

The root records project/revision/checkpoint, terminal project state,
environment observations, policy bounds, and paths to the model roster, atomic
requirement coverage, release ledger, and checkpoint-chain manifest.

Each task materializes these fields before `challenged`:

- stable ID, state, normative spec and atomic `requirements[]`;
- dependencies, exclusive `write_set[]`, and named `acceptance_gates[]`;
- reviewed `capabilities` (argv, cwd/read/write roots, network and external
  operation classes) plus CI/agent deadlines;
- evidence references and ordered `attempts[]`.

Ranges are allowed only in this pre-driver handoff. `BOOT-002` expands the
registry into one machine-readable row per requirement ID with exactly one
primary task, proof type, expected test/artifact, and current status. No later
task may become `ready` until uniqueness and full coverage pass.

## Attempt manifest

An attempt is persisted atomically before launch and contains:

```text
id, task_id, state, approach_fingerprint
created_at, updated_at, lease_owner, lease_expires_at
agent_role, agent_name, model, provider, variant, opencode_session_id
worktree_path, branch, base_sha, head_sha, write_set
plan_path/hash, challenge_paths/hashes, review_paths/hashes
commands[{argv, cwd, started_at, ended_at, exit_code, artifact_hashes}]
pr_number/url/head_sha, ci_checks, merge_sha
checkpoint_transaction, failure_class, archive_path
capability_manifest_path/hash, ci_started_at, ci_deadline_at, ci_reruns
```

Paths resolve under validated repository/worktree/runtime roots. Identity fields
prove role separation. Leases have explicit TTL and heartbeat; expiration
triggers reconciliation/archive, never deletion or automatic success.

## States and transitions

Task states are `planned`, `ready`, `challenged`, `claimed`, `implementing`,
`reviewing`, `integrated_pending_checkpoint`, `verified`, and
`blocked_external`. Attempts additionally allow `failed`, `superseded`, and
`archived`. Each transition records previous/new state, timestamp, actor, cause,
and hashes of the evidence used.

Only the driver writes runtime state. Only a checkpoint transaction updates the
committed snapshot. Validation rejects unknown states, missing dependencies,
cycles, overlapping live write sets, expired active leases, duplicate owners,
unverified dependencies, or mismatched evidence hashes.

## Validation commands

`BOOT-002` provides Bun-only commands used locally and in CI:

```text
bun run orchestration:validate
bun run orchestration:audit --task <id> --attempt <id>
bun run orchestration:reconcile --dry-run
```

Validation is read-only unless explicit reconcile creates a reviewed proposal.
Exit `0` means valid; `2` schema/input error; `3` invariant/evidence failure;
`4` external state unavailable; `5` internal driver failure.
