# OpenCode model routing

## Purpose

Distribute work across the models actually available to the user's OpenCode
installation. Model names are runtime inventory, never spec constants.

## Preflight inventory

Archive these outputs with exact OpenCode version before every implementation
run and after provider/model configuration changes:

```text
opencode --version
opencode models --refresh --verbose
opencode agent list
opencode run --help
opencode export --help
```

Read configured favorite models when OpenCode exposes them. If favorites are not
machine-readable, include every authenticated model returned by `models` and
mark the missing favorite signal; do not guess credentials or availability.

Run the versioned calibration pack on plausible candidates: one architecture
challenge, one bounded code/test task, one defect review, and one research
source-check. Record correctness, tool reliability, latency, context limit,
provider, variant/effort, and reported cost. Calibration chooses routing; it
does not change product benchmarks.

Persist the result to `docs/orchestration/model-roster.toml` with the raw model
inventory hash. A model assignment remains fixed for one task attempt.

The roster schema is versioned and records, per exact provider/model/variant:
availability/auth probe, family, context limit, reported cost, favorite signal,
four calibration scores, tool-success rate, P50/P95 latency, timeout, last
observation, and eligible tiers/roles. It also stores calibration fixture hashes
and OpenCode version. Selection first filters eligibility and availability, then
maximizes correctness, breaking ties by tool reliability, latency, then cost.
Provider timeout/unavailability returns the task to `ready` and selects the next
eligible entry; it never lowers a gate. `BOOT-002` must first prove that the
installed OpenCode version can invoke explicit agents/models/sessions; no
subagent behavior is assumed from `agent list` alone.

## Capability tiers

| Tier | Work |
| --- | --- |
| A — frontier reasoning | primary orchestrator, architecture/security challenge, hard blockers, final audit, arbitration |
| B — strong coding | bounded feature implementation, integration, difficult test repair |
| C — fast/reliable | inventory, fixtures, mechanical tests, docs, command verification |

Cost never promotes a weaker result over correctness. Use the cheapest model
that has passed the relevant calibration. Reserve Tier A for leverage points.

## Role separation

- `orchestrator`: strongest reliable reasoning/tool model; owns state and
  integration, writes no feature code.
- `planner`: analyzes one ready task and proposes its bounded implementation.
- `challenger`: attacks the proposal before implementation.
- `implementer`: writes only in its assigned worktree.
- `spec-reviewer`: read-only comparison of diff/evidence to requirement IDs.
- `quality-reviewer`: read-only bug/security/architecture/test review.
- `verifier`: reproduces commands in a clean worktree and records artifacts.
- `arbiter`: Tier A model used after unresolved independent disagreement.

An agent cannot review or approve its own output. For security, persistence,
concurrency, MCP contract, dependency, and release tasks, use a different model
family/provider for at least one challenger when available.

## Parallelism

Start with at most four implementation worktrees. Increase only after the
OpenCode orchestration and provider-rate probes show stable completion. Agents
may read shared specs concurrently; one writer owns each worktree. Subagent
depth begins at one. Only the durable primary orchestrator schedules further
work.

Do not use global `--continue` between worktrees. Resume a recorded unit with
its explicit `--session <id>` and cwd/worktree. Export every consequential
session with sanitization; Git/checkpoints remain authoritative.

## Degradation

If a chosen model becomes unavailable, return the task to `ready`, record the
failed assignment, and select another model that passed the same capability
calibration. A fallback model may not combine implementer and reviewer roles or
lower the acceptance gate.
