# OpenCode model policy

## Controller

Use one powerful model chosen by the user for the control loop. Keep that model
selection fixed across controller, implementation, review, and subagent sessions,
and record the exact model and variant in each run trace.
There is no calibration suite, scoring table, provider roster, or automatic
cost-based routing in BOOT-002.

## Sessions

The controller may:

- implement directly for bounded work;
- start a fresh implementation session for a large task;
- start a fresh review session to reduce confirmation bias;
- delegate bounded searches or independent checks to subagents.

The same selected model fills these roles in separate sessions. The controller
does not route work across model families or providers.

## Context And Compaction

OpenCode manages context and auto-compaction natively. Before a long transition
and after every meaningful step, persist the durable facts in the task trace.
After compaction, re-read state and the latest trace instead of trying to rebuild
conversation history from model exports.

## Failure

If the selected model is unavailable, record the exact error and pause so the
user can explicitly replace the selection. Do not route automatically or weaken
task checks to keep the loop moving.
