# Simple evidence-driven OpenCode loop

Implementation is coordinated by one powerful OpenCode controller working on
one dependency-complete task at a time. OpenCode handles context compaction
natively. After each meaningful step, the controller writes a concise Markdown
trace containing completed work, files, commands, decisions, findings, and the
next action.

Implementation work uses a Git worktree below `.worktree/`. Substantial changes
receive a fresh review session and required tests before integration. The loop
resumes from state, Git, and the latest trace until all requirements pass, the
user pauses it, or an exact external blocker remains.

Rejected complexity includes model calibration/rosters, mandatory multi-model
role pipelines, parallel worktree scheduling, cryptographic
checkpoint chains, custom capability sandboxes, native brokers, and generic
orchestration-product scope. These mechanisms solve problems this project has
not demonstrated.
