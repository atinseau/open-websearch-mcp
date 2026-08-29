# SPK-004 challenge record

## Challenge

`TEST-013` requires extractor selection against the teacher standard, but the
sealed 2026-08-28 standard cannot supply a URL-located desired passage: all 18
accepted claims have an empty `evidence_passages` array. The comparison can
measure whether Obscura exposes teacher URLs, concepts and literal grading
patterns, but it cannot determine whether a returned span is the correct
evidence for a claim, or whether its surrounding text is noise.

## Counterargument

The 2026-08-27 historical two-teacher refresh contains stronger evidence, so it
could be used to choose a library now.

## Resolution

Rejected for the current decision. SPK-004 is explicitly scoped to the current
teacher corpus, whose provider and grounding model changed materially under
ADR-0006. Mixing it with the retained historical corpus would hide the current
calibration deficit. No candidate extractor is adopted. The required remedy is
a future teacher capture exposing URL-located passages (or a new ADR restoring a
second teacher), after which the identical cache-first benchmark can compare
candidate output on the same pages.
