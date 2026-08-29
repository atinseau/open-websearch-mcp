# VER-001 verification

- Full required gates passed: `bun run format`, `bun run lint`, `bun run
  lint:limits`, `bun run lint:types`, `bun run typecheck`, `bun test --parallel
  --isolate` (221 passed), and `bun run check`.
- `bun run benchmark:grade` was run twice, with the second output directed to
  `/private/tmp/ver-001-repeat.json`; `cmp -s` confirmed byte-identical reports.
- Generated report: `benchmarks/grader/report.json` records every case and all
  component values. It is a source-only deterministic mechanics probe, not a
  claim of live relevance.
- Gate verdict: blocked by data adequacy, not an implementation defect. ADR-0010
  challenges release gating until a new immutable passage-bearing teacher refresh
  exists. No state file was changed and no commit was created.
