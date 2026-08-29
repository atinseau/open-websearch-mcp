# SPK-003 — Obscura capacity

## Decision

**Measured fact:** the final bounded run completed 254 navigations over all
seven required levels, both cold and warm profiles, with zero timeout/error
outcomes and zero owned Obscura or harness processes after cleanup.

**Inference:** throughput plateaus after 16 slots and warm P95 crosses the
controller's `2 × baseline` health boundary at 24 slots.

**Decision:** retain the normative controller limits (start 8, maximum 40,
maximum 2 per host, one Google SERP). Publish a 192 MiB safe RSS budget, a
456 ms warm P95 baseline, and last safe capacity 16 in
[controller-fixture.json](controller-fixture.json). This does not lower the
normative maximum; it calibrates automatic growth and the no-RSS-telemetry
ceiling for this measured profile.

## Environment and method

| Item | Measured value |
| --- | --- |
| Base commit | `1ad1127b74ef9d0be3c4c8375d4c0a1404cbc742` |
| Bun | `1.4.0` |
| Obscura | `0.2.1` |
| Host | macOS 26.5.1 (25F80), Darwin 25.5.0, arm64 |
| Physical memory | 36 GiB (`38654705664` bytes) |
| Obscura configuration | owned loopback process, `--stealth --allow-private-network --storage-dir <unique-profile> --quiet` |
| Navigation timeout | 15 seconds per view |
| Workload | 254 total navigations; fresh profile per cold trial, identical persisted profile for its warm trial |

The Bun-only harness reuses SPK-002's explicit `Bun.WebView` Chrome backend
and its owned Obscura CDP URL. It serves static, JS-heavy, controlled-350 ms
slow, technical, news, community, and 503 fixtures on distinct
`fixture-N.localhost` origins, so no fixture host exceeds one simultaneous
navigation (stricter than the normative maximum of two). Two public samples
were made only in the level-1 cold and warm trials: `https://bun.sh/docs` and
`https://news.ycombinator.com/`. No public host received more than one request
per trial, and all high-concurrency work stayed local.

RSS and CPU are the sum of the harness process and its owned Obscura child,
sampled immediately after each trial with `ps`. CPU is an instantaneous sample,
not a CPU-time average. Event-loop responsiveness is the maximum observed
zero-delay timer lag while a trial was active. A 503 page rendered an error
document successfully; this measures renderer behavior rather than claiming
that HTTP 503 must be a navigation failure.

## Final measured results

| Slots | Trial | RSS MiB | CPU % | Throughput / s | P50 ms | P95 ms | Timeout | Error | Loop max ms | Orphans |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | cold | 106.4 | 0.1 | 1.63 | 606.0 | 1209.2 | 0% | 0% | 1.19 | 0 |
| 1 | warm | 111.3 | 0.3 | 1.79 | 487.3 | 1174.5 | 0% | 0% | 1.53 | 0 |
| 4 | cold | 59.4 | 1.1 | 9.80 | 404.1 | 407.9 | 0% | 0% | 1.16 | 0 |
| 4 | warm | 59.8 | 1.3 | 10.18 | 390.4 | 392.9 | 0% | 0% | 1.16 | 0 |
| 8 | cold | 61.1 | 1.2 | 17.61 | 451.2 | 454.0 | 0% | 0% | 1.17 | 0 |
| 8 | warm | 61.2 | 1.7 | 17.56 | 452.8 | 455.5 | 0% | 0% | 1.17 | 0 |
| 16 | cold | 62.7 | 2.0 | 17.81 | 895.7 | 898.1 | 0% | 0% | 2.82 | 0 |
| 16 | warm | 62.3 | 1.8 | 17.92 | 890.5 | 892.9 | 0% | 0% | 1.19 | 0 |
| 24 | cold | 62.8 | 1.0 | 13.98 | 1713.1 | 1713.1 | 0% | 0% | 1.32 | 0 |
| 24 | warm | 64.3 | 1.0 | 13.55 | 1768.9 | 1768.9 | 0% | 0% | 2.16 | 0 |
| 32 | cold | 64.8 | 1.7 | 14.76 | 2165.3 | 2165.3 | 0% | 0% | 1.28 | 0 |
| 32 | warm | 64.4 | 1.9 | 14.91 | 2143.5 | 2143.6 | 0% | 0% | 1.23 | 0 |
| 40 | cold | 67.7 | 1.8 | 15.33 | 2606.3 | 2606.3 | 0% | 0% | 1.54 | 0 |
| 40 | warm | 65.0 | 2.0 | 15.34 | 2604.6 | 2604.7 | 0% | 0% | 1.22 | 0 |

At 8, the warm P95 is 455.5 ms; the decision rounds this to 456 ms. Twice
that baseline is 912 ms. Warm 16 is healthy (892.9 ms), while warm 24 is not
(1,768.9 ms). Peak observed total RSS was 116,686,848 bytes (111.3 MiB),
including the small public-sample trial. The 192 MiB decision budget has
measured headroom and makes its 80% backpressure mark 153.6 MiB.

## Explicit controller tests

| Required test | Measured fact / deterministic fixture expectation |
| --- | --- |
| Missing memory telemetry | The controller fixture sets `memoryTelemetryAbsentMaximumCapacity` to 16. SPEC-02 must hold or reduce above that point; latency/error backpressure remains active. |
| New-machine profile | Each cold trial used a new unique `/private/tmp/spk-003-…-profile-<level>` storage directory. |
| 8 → higher growth | Warm P95: 8=455.5, 16=892.9, 24=1768.9, 32=2143.6, 40=2604.7 ms. The last healthy automatic capacity is therefore 16. |
| Persisted-profile reuse | Every warm trial restarted Obscura against the immediately preceding cold trial's same storage directory; `profileReuse: true` is recorded for all seven warm trials. |

## Evidence, reproducibility, and cleanup

```sh
bun x tsc --ignoreConfig --noEmit --target esnext --module preserve --moduleResolution bundler --strict --types bun-types spikes/obscura-load/load.ts
bun spikes/obscura-load/load.ts docs/spikes/SPK-003/measurements.json
pgrep -fl 'spikes/obscura-load/load.ts|obscura serve --host 127.0.0.1' || true
```

Final command outputs are preserved machine-readably in
[measurements.json](measurements.json), including every sample, profile reuse,
telemetry, and per-trial orphan array. The final `pgrep` produced no matching
process. SHA-256 values after the final run:

```text
0f13e677da9342cd1d7d819f9ae378f6752208a8f21d66502061ac3a55c5a102  spikes/obscura-load/load.ts
d73e4b08dece3d23d4e4ab3fec6f8ca8b6535c606e775578c2282f113f5418e5  docs/spikes/SPK-003/measurements.json
```

The challenge and the corrected preliminary-routing/cleanup findings are
retained in [challenge.md](challenge.md). No measurement was extrapolated.
