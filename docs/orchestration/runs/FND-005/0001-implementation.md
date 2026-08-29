# FND-005 implementation

- Task/attempt: `FND-005` / `a1`
- Branch/worktree: `agent/fnd-005-a1` / `.worktree/fnd-005`
- Base and current HEAD: `91ca2cca05d010c2f9478d21e1096b560c8e75c2`
- Goal: implement the process-global adaptive fair navigation scheduler and cancellation.

## Completed work

- Added the public rendering scheduler factory, injected clock/RSS interfaces, and optional per-navigation deadline.
- Implemented a round-robin-by-investigation queue with alternating explicit-open preference, per-host and Google SERP limits, active/queued cancellation, deadlines, and shutdown cleanup.
- Separated the calibrated adaptive controller from queue mechanics. It consumes the FND-002 scheduler snapshot and SPK-003 values: start `8`, maximum `40`, last safe/no-RSS ceiling `16`, host `2`, SERP `1`, RSS budget `201326592`, warm P95 `456`, windows `20` and `10000ms`, growth `2` after `2` healthy windows, and the published pressure fractions/multiplier.
- Did not reimplement installation: `createObscuraInstaller` remains the FND-002 single-flight installer seam.
- Added deterministic fake-clock acceptance tests for fairness, growth, all independent backpressure triggers, hold, missing telemetry, host/SERP ceilings, explicit-open priority, and cancellation release.

## Changed files

- `src/features/rendering/index.ts`
- `src/features/rendering/application/controller.ts`
- `src/features/rendering/application/scheduler.ts`
- `tests/rendering/navigation-scheduler.test.ts`

## Verification

All passed:

```text
bun run format
bun run lint
bun run lint:limits
bun run lint:types
bun run typecheck
bun test --parallel --isolate
bun run check
```

The full suite reported 138 passing tests. `git diff --check` was clean.

## Decisions and next action

The scheduler is constructed once by the future composition root, making its state process-global. Per-call immutable snapshots and AbortControllers remain owned by the existing investigation/MCP call lifecycle; the scheduler consumes the snapshot-derived `SchedulerConfiguration` supplied to its factory. No blocker. Next: review this branch and integrate through the normal reviewed PR path; do not commit from this task.
