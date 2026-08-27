# Step traces and recovery

## Durable Trace

After every meaningful step, add:

```text
docs/orchestration/runs/<task-id>/NNNN-<step>.md
```

The file records task/attempt, timestamp, model/session, worktree/branch/SHA,
goal, completed work, changed files, commands/results, decisions, findings,
remaining work, and one exact next action.

This trace is the handoff for OpenCode auto-compaction, a fresh session, or a
human returning later. Keep it concise enough to reread before every step.

## Corrections

Do not silently rewrite a completed trace to make history look cleaner. Add a
new correction step referencing the mistaken file. Git history provides normal
integrity; no cryptographic chain or dedicated checkpoint PR is required.

## Resume

On resume:

1. read SPEC, ORCHESTRATION, state, and the latest task trace;
2. inspect Git and the recorded `.worktree/` path;
3. compare actual files/tests with the trace;
4. correct stale state if necessary;
5. perform the recorded next action or explain why it changed;
6. write the next trace before continuing.

## Blockers

An external blocker trace names the missing permission, service, credential, or
upstream capability, shows the observed error, and states the smallest human
action required. Bugs, failed tests, difficult design, or model disagreement are
not external blockers.
