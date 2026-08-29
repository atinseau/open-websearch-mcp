# SPK-004 step 0002 — native Markdown baseline

- Command: `bun spikes/extraction/benchmark.ts docs/spikes/SPK-004/measurements.json` (elevated only to permit scoped Obscura process launch and public navigation).
- First attempt: RSS sampling raced a completed short-lived child. It produced no result artifact; the sampler was corrected to tolerate an exited PID.
- Final result: 17/18 normalized claim-source URLs rendered sequentially and were cached; 28/76 literal grading patterns and 69/88 required concepts were found. Structural totals: 786 headings, 7,468 links, 6 tables, and 468 code fences. Latency median 4,524 ms; sampled child RSS median 171,568 KiB.
- Failure retained: `https://www.nic.ad.jp/ja/dom/idn.html`, a Font Awesome 403 followed by Obscura's script timeout.
- Cleanup: elevated `pgrep -fl obscura || true` printed no process after the benchmark. No process outside this task was terminated.
- Decision: no candidate extractor. The 18 claims have zero evidence passages, so source-located evidence coverage/noise cannot be benchmarked; see `docs/spikes/SPK-004/report.md` and `challenge.md`.
- Next action: format/report and run repository gates.
