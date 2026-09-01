# REL-003 release-candidate workflow correction

- Task/attempt: REL-003 / correction after 0001
- Completed: removed the superseded manual release-candidate workflow.
- Reason: `publish.yml` now owns the complete authorized tag release path:
  full deterministic gate, packed-artifact smoke, authorized npm publication,
  matching Git tag, GitHub Release, changelog, and evidence archive. It
  successfully published `open-websearch-mcp@0.2.0` from `main` on 2026-09-01.
- Decision: preserve the original trace as historical evidence, but replace
  `release.yml` with `publish.yml` in the live orchestration evidence. A manual
  candidate check that neither publishes nor feeds publication would duplicate
  the release gate and invite an operator to run the wrong workflow.
- Verification: the PR workflow runs the same `bun run check` gate as the
  publication workflow; its live tests remain opt-in because
  `OPEN_WEBSEARCH_LIVE` is unset.
- Exact next action: run the full gate and workflow syntax validation, then
  submit the cleanup through a reviewed PR.
