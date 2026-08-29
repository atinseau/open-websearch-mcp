# Codex-only teacher with deterministic grounding verification

## Status

Accepted, challenged. Supersedes the two-teacher part of ADR-0003.

## Context

`TEST-006` and `TEST-009` originally required two independent CLI teachers:
Codex derived fixtures and Claude Code independently verified them, so that only
mutually validated claims became fixture requirements.

During the `2026-08-28` refresh the Claude teacher became unusable. An
isolation strategy copied rotating OAuth credentials into a temporary HOME; a
temporary process refreshed the token and cleanup deleted the rotated value,
revoking the primary Claude session. Twenty Codex captures completed; only six
Claude captures completed. The failed Claude policy probes are retained under
`benchmarks/teachers/runs/2026-08-28/failures/`.

Recovering the second teacher requires human reauthentication of a paid external
provider. The user directed that Claude be abandoned rather than reauthenticated.

## Decision

Use Codex as the single teacher. Replace cross-model verification with a
deterministic, LLM-free grounding verifier: a derived claim becomes a fixture
requirement only if it is literally supported by the captured trace, and each
rejection is archived with its reason.

`TEST-008` is amended by this ADR. Codex `exec --json` exposes no tool-result
payloads, so URL-located evidence passages cannot be captured from a Codex-only
run; in the retired design they came from Claude's `WebFetch`. The requirement
now captures the elements the teacher CLI actually exposes and obliges the
refresh report to declare what is missing, rather than implying an evidence
artifact this provider cannot produce.

The verifier accepts a claim when every cited source URL was observed in the
run, every distinctive word of the claim text occurs as a whole word in the
evidence, every required concept appears adjacently or within a 160-character
span of that evidence, and every grading pattern compiles and matches. The
exact rules and the rationale for the constants are documented in the SPK-001
report; no threshold is calibrated against acceptance counts.

## Consequences

- The 20 existing Codex captures remain valid evidence; no recapture is needed.
- Fixture derivation becomes reproducible: two runs over the same traces produce
  identical fixtures and identical rejections, which `TEST-012` already demands
  of the runtime benchmark and which cross-model verification could never offer.
- The corpus loses cross-provider diversity. Fixtures may inherit a Codex-shaped
  view of which sources are authoritative. `TEST-013` and `TEST-019` already
  forbid treating the teacher as an oracle, which bounds this risk but does not
  remove it.
- Claude-specific capture, policy, and audit code is removed rather than left
  dormant, so no untested credential-handling path survives in the tree.
- Adding a second teacher later requires a new challenged ADR and a fresh probe.
- Grounding is answer-level and lexical. No claim is tied to a quoted span of a
  specific source, so the fixtures cannot support source-attribution reasoning.

## Challenge

The strongest objection is that this is strictly weaker evidence, in two
compounding ways, and that calling the result "grounded" risks overstating it.

First, a single teacher removes independent curation: nothing external now
contradicts a claim Codex both drafted and supplied the evidence for. Second,
and more seriously, the verifier cannot check that a cited source supports a
claim, because Codex exposes no URL-located passages. It checks that the source
was visited and that the claim's vocabulary is lexically present nearby. A
plausible-sounding claim assembled from vocabulary the run genuinely used, citing
a URL the run genuinely opened, will be accepted even if that specific source
never supported it.

This objection is accepted rather than rebutted. The decision trades
cross-provider agreement and source attribution for reproducibility and for
removing a credential-handling hazard. Three constraints bound the risk: the
verifier rejects the large majority of the claims it judges (115 of 133 drafted
claims, leaving 18 accepted across 10 of 20 cases), `TEST-013` and `TEST-019`
already forbid treating the teacher as an oracle, and the sealed 2026-08-27
two-teacher refresh is retained as stronger historical evidence.

The resulting corpus is deliberately small. Two successive review rounds found
that looser rules accepted claims containing invented vocabulary, so the rules
were tightened and the corpus shrank from 56 to 48 to 18 accepted claims. A
corpus this sparse may prove too thin to calibrate `SPK-004` extraction
decisions or the `TEST-015` metric weights. That is a real risk of this
decision, and it is recorded rather than hidden: if the fixtures prove
insufficient, the correct response is to restore a second teacher or a
passage-exposing capture path under a new ADR, not to relax the grounding rules.

Revisit this decision if `SPK-004` shows extraction decisions are sensitive to
teacher provider choice, or if a future Codex release exposes tool-result
payloads, which would make URL-located grounding possible again without a second
teacher.
