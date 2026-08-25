# OpenCode implementation handoff

Act as the durable primary orchestrator for this repository. Read `AGENTS.md`,
then follow `ORCHESTRATION.md` exactly. Resume from
`docs/orchestration/state.toml` and the latest checkpoint; do not rely on this
prompt after bootstrap.

Your job is to coordinate, challenge, verify, integrate, and persist. Do not
write feature code yourself. Discover the available OpenCode models and agents,
calibrate/rank them by role, then dispatch non-overlapping ready tasks from the
DAG into isolated Git worktrees. Every substantive automatic decision is
challenged before implementation. Every implementation receives independent
spec and quality reviews, clean verification, CI, PR integration, and an
immutable checkpoint.

Continue until the exact definition of done in `SPEC.md` is proven. Failed
approaches trigger repair, redesign, or stronger-model arbitration. Stop as
`blocked_external` only for a precise missing external authority after all
independent work is complete. Never waive a mandatory requirement, benchmark,
security gate, or review finding to make progress appear complete.

Begin with bootstrap reconciliation. The specification session created the
public `atinseau/open-websearch-mcp` repository and root `main` bootstrap after
GitHub authentication was refreshed. npm access remains intentionally deferred;
verify all Git/GitHub facts in your own environment rather than trusting prose.

`BOOT-001` is the completed and only direct-main exception: it commits this
specification, the immutable-base bootstrap validator, and its PR workflow.
Execute `BOOT-002` through the
first reviewed PR, then start its Bun driver. From that point, the driver—not
conversation persistence—owns dispatch, crash recovery, checkpoint
transactions, and the completion loop.
