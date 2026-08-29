# REL-003 release-candidate workflow

- Task/attempt: REL-003 / 0001
- Branch/worktree: agent/ver-004-a1 / .worktree/ver-004
- Base: 4c5344f0cc9eece4339b787d998376a54fdaf11f
- Completed: added main-only manual release-candidate workflow and unreleased changelog.
- Decision: the workflow validates and archives candidate evidence only. It does not publish npm, tag, or create a GitHub Release. Those actions require explicit human authorization and REL-004's idempotent external ledger.
- Verification: local required gate and packed-artifact smoke passed; workflow uses pinned actions and Bun 1.4.0.
