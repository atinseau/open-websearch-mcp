# Review protocol

## When To Review

Substantial code, public contracts, security behavior, persistence, concurrency,
dependencies, and releases receive a fresh OpenCode review before integration.
Tiny mechanical edits may rely on focused tests and the controller's inspection.

## Review Input

The reviewer receives the relevant spec, diff, tests, and latest task trace. It
checks:

- compliance with owned requirements;
- correctness, edge cases, and failure behavior;
- architecture and dependency direction;
- security and resource bounds where relevant;
- whether tests would fail when the implementation is wrong;
- unnecessary complexity or scope drift.

Findings are `blocker`, `high`, `medium`, or `low`. Integration requires zero
blocker/high findings. The implementation session repairs findings and the fresh
review session checks the resulting diff.

## Decisions

The controller can make reversible implementation choices directly and records
them in the step trace. A fresh challenge is required only when a decision changes
a public contract, a security boundary, persistent data, a major dependency, or
the normative spec.

There is no mandatory planner/challenger/spec-reviewer/quality-reviewer/arbiter
pipeline for every task. Add review depth when risk justifies it.

## Final Review

At project completion, run a fresh whole-project review, all release checks, and
the requirement coverage audit. Any mandatory failure returns to the loop.
