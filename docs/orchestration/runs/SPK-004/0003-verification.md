# SPK-004 step 0003 — verification

- Focused formatting and TypeScript check passed for `spikes/extraction/benchmark.ts`.
- Passed: `bun run format`, `bun run lint`, `bun run lint:types`, `bun run typecheck`, `bun test --parallel --isolate`, and `bun run check`.
- The full tests initially showed 86 pass / 9 fail under the restricted sandbox only. Those failures all arose in pre-existing SPK-001 process-control tests where `/usr/bin/sandbox-exec` was prohibited from spawning `/bin/ps`; the required elevated rerun passed 95 tests / 352 expectations / 0 fail, followed by passing `bun run check`.
- Scope audit: only `spikes/extraction`, `docs/spikes/SPK-004`, and the required `docs/orchestration/runs/SPK-004` traces are untracked/changed. `git diff --check` passed.
- Final decision: native Obscura Markdown remains baseline; no extractor candidate is adopted because zero teacher evidence passages makes a demonstrated extraction-quality gain impossible.
