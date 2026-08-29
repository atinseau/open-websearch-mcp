# SPK-003 challenge record

## Challenged proposition

The deterministic adaptive controller can grow beyond 16 destination slots on
this machine while remaining within its own latency-health rule.

## Evidence considered

The corrected 2026-08-28 run completed every tested level through 40 with no
navigation error, timeout, or owned-process orphan. Its warm P95, however,
rose from 455.5 ms at the required start capacity of 8 to 892.9 ms at 16 and
1,768.9 ms at 24. The controller health boundary is twice the calibrated warm
baseline: 912 ms.

## Decision

Reject the proposition for automatic growth. The controller fixture preserves
the normative maximum of 40 but uses `lastSafeCapacity: 16`; telemetry absence
also prevents growth above 16. This is a calibration decision, not a change to
the normative capacity bounds.

## Failed preliminary run retained

An earlier harness revision used `127.0.0.x` aliases. Obscura accepted only
the `127.0.0.1` fixture origin in that configuration, so levels above one
timed out. That result is not presented as a capacity measurement. The final
harness uses distinct `*.localhost` fixture hosts and isolated process groups.
The preliminary run also revealed that killing only the CLI parent left a
worker process. The final harness kills its own detached process group and the
final post-run inspection found zero tagged processes.
