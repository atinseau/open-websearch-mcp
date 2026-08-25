# Challenge and review protocol

## Pre-implementation challenge

Every task begins with a proposal containing requirement IDs, affected public
interfaces, write set, ordered changes, tests/evidence, assumptions, dependency
choices, and failure/rollback behavior. An independent challenger returns one:

- `accept` — evidence supports the smallest complete plan;
- `accept_with_changes` — listed changes are incorporated and rechecked;
- `reject` — the approach violates a requirement, lacks evidence, or creates
  avoidable complexity.

No production write begins after `reject`. The accepted challenge record is
committed with the task evidence.

Mechanical formatting/name choices governed completely by existing config do
not need individual prose. Any automatic choice affecting behavior, interface,
dependency, persistence, concurrency, security, performance, testing, or
release does.

## Independent post-implementation reviews

The spec reviewer receives the normative spec, requirement registry, diff, and
test artifacts. It checks every owned ID, exclusions, public semantics, and
traceability.

The quality reviewer independently inspects correctness, edge cases, security,
concurrency, lifecycle, architecture direction, simplicity, dependency reuse,
tests, failure modes, and performance risks. It is not given the implementer's
argument for why the code is good.

Findings use:

- `blocker`: unsafe, data-loss, protocol/security violation, or mandatory spec
  missing;
- `high`: likely bug, untested critical path, architecture violation, or
  material benchmark regression;
- `medium`: bounded correctness/maintenance risk;
- `low`: optional improvement with no acceptance impact.

Merge requires zero blocker/high findings and every spec criterion proven.
Medium findings are fixed or explicitly accepted by a challenged decision with
no requirement impact. Low findings may become backlog tasks.

## Repair and arbitration

The implementer repairs findings in the same worktree and both reviewers inspect
the resulting diff/evidence. Two unresolved rounds trigger a Tier A arbiter. Three
failed variants of the same approach trigger a fresh plan and, when useful, a
different implementer/model. These are escalation points, not permission to
stop or weaken tests.

An amendment to normative behavior is a separate PR. Its challenger compares
the amendment to the master outcome/invariants and research evidence. The
implementation depending on it waits until the amendment merges.

## Final audit

When the DAG appears complete, assign independent agents to:

1. map every requirement ID to code, tests, evidence, PR, and checkpoint;
2. inspect architecture/security/spec compliance on the whole main tree;
3. reproduce release gates from a clean checkout/package;
4. search for TODOs, skipped tests, disabled rules, mock-only success, stale
   docs, orphan artifacts, and waived failures.

Any failure creates a new repair task and resumes the loop.

