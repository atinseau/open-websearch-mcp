# SPK-001 step 0027 — Codex-only teacher redesign

## Context

Step 0026 left the refresh partially recaptured: 20 Codex captures succeeded, the
Claude provider was revoked by a credential-rotation incident, and the product
question was unresolved. The user directed that SPK-001 be redesigned as
Codex-only.

## Decision

Recorded `docs/adr/0006-codex-only-teacher-with-deterministic-grounding.md`.
Codex becomes the single teacher and a deterministic, LLM-free grounding verifier
replaces cross-model verification. The spec was amended before any implementation
change.

## Normative changes

- `docs/spec/requirements.md`: `TEST-006` drops the second teacher; `TEST-007`
  describes one prompt; `TEST-009` requires deterministic grounding verification
  with archived rejections.
- `docs/spec/01-feasibility-spikes.md`: spike S1 describes one teacher and the
  grounding verifier, and records that a future second teacher needs a new ADR.
- `docs/adr/0003` notes that ADR-0006 supersedes its two-teacher curation.
- `docs/orchestration/dag.md`: SPK-001 outcome renamed.

## Implementation

- Added `benchmarks/teachers/fixture-grounding.ts`, the deterministic verifier.
- Added `benchmarks/teachers/reverify-fixtures.ts` to replay verification from
  archived drafts without new Codex runs.
- Removed the Claude verification subprocess from `derive-fixture-runners.ts` and
  the Claude branches from `capture-probe.ts`, `capture-corpus.ts`, and
  `normalize-capture.ts`.
- `fixture-contract.ts` accepts `verified_by: grounding` with `trace_grounded`
  provenance and retains the legacy Claude envelope parser for the sealed
  historical refresh.
- `claude-policy-controls.ts` exports are renamed `legacy*` and are audit-only.
- `audit-cases.ts` audits one provider for current refreshes and two for the
  historical one, recomputes verification deterministically, and permits the
  retained non-case `failures/probe` tree required by SPEC-01.

## Corpus

- Archived then removed the six partial Claude case captures and the Claude probe
  from the 2026-08-28 refresh. Backup: `/private/tmp/spk-001-claude-retired-2026-08-28`
  (20 files, verified count-for-count before removal).
- Added `runs/2026-08-28/refresh.json` with trigger `major-change`.
- Derived 20 fixtures, then re-verified after two grounding corrections.
- Sealed the manifest: 20 cases, 20 runs, 20 fixtures, 235 artifacts, conforming.
- The historical 2026-08-27 refresh still audits as historical with 40 runs.

## Findings

The first grounding rule required a verbatim evidence passage and rejected all
133 claims. Codex `exec --json` exposes no tool-result payloads, so
`evidence_passages` is empty for every Codex run; passages had come from Claude
`WebFetch` in the retired design. The rule was corrected to prove grounding
against observable Codex fields and to require every cited source URL to be
observed in the run.

A second correction followed: 115 of the remaining 122 rejections were required
concepts such as `probabilistic_ranking`, which are identifier labels rather than
quotations. Concept matching now accepts a verbatim label or all of its
significant word tokens. The final corpus accepts 56 claims and archives 154
rejections, with one to five accepted claims in every case.

## Review corrections

Two independent reviews ran against this state. Both returned blockers, and the
findings were correct.

1. **Normative edits were written to the wrong tree.** The spec, ADR, and DAG
   changes had been applied to the main checkout instead of
   `.worktree/spk-001-a1`, so the worktree's implementation contradicted its own
   normative documents. The five files were moved into the worktree and the main
   checkout was restored to clean. This was the single most serious defect in the
   change.
2. **The verifier never checked a claim's own text.** It validated concepts,
   patterns, and sources but not the proposition, so a claim could be assembled
   from observed vocabulary and accepted. Added `claimTextGrounded`.
3. **Scattered-token concept matching was too permissive.** Replaced with
   adjacency or a bounded 160-character proximity window; tokens co-occurring
   across unrelated text no longer count as support.
4. **`schemas/teacher-fixture.schema.json` still required `verified_by: claude`**
   and a `claude_run`, so current fixtures failed the published contract. The
   schema now covers both the grounding and legacy forms.
5. **No direct verifier tests existed.** Added `fixture-grounding.test.ts`
   (8 tests) covering acceptance, absent text, absent source, unmatched and
   invalid patterns, proximity boundaries, and determinism.
6. **`TEST-008` was silently unmet.** Codex exposes no URL-located passages, so
   the requirement was amended explicitly and ADR-0006 records the amendment
   instead of leaving the gap implicit.
7. **Report and ADR overclaimed.** The report now states exactly what
   `trace_grounded` does and does not prove, corrects a stale
   `major-prerelease` narrative, and justifies the `major-change` trigger. The
   ADR challenge section now states the strongest counterargument honestly.

## Second review round

Both reviews ran again and returned 0 blockers, with independent high findings
on the grounding thresholds. Both were reproduced and accepted.

- The 0.8 content-word tolerance accepted a claim in which `retrieval` was
  replaced by the invented word `unicorn`. Removed the tolerance: every
  distinctive word must now be present, matched on whole-word boundaries.
- The proximity check anchored on the first token, so an "160-character window"
  actually admitted spans up to ~320 characters. Replaced with a minimum-range
  sweep measuring the span between outermost tokens.
- Removed the undocumented 512-occurrence cap, which could falsely reject a
  concept grounded later in the evidence.
- Added boundary tests for both reviewer counterexamples, substring-vs-word
  matching, and windows found beyond first occurrences (12 verifier tests).
- Documented the exact algorithm and both constants in the report and ADR.

Tightening the rules shrank the corpus from 48 to 18 accepted claims across 10
of 20 cases, with 192 archived rejections. The rules were tightened rather than
the corpus preserved. The sparseness is recorded in ADR-0006 as a risk to
SPK-004 and TEST-015 calibration, with the explicit instruction that the remedy
is a second teacher or a passage-exposing capture path, never looser grounding.

## Third review round

A final targeted review confirmed both round-2 fixes and found further defects,
all corrected:

- The adjacency fast path in `conceptGrounded` skipped whole-word boundaries, so
  concept `cat` matched "concatenate". Boundaries now wrap the whole adjacent
  sequence.
- A concept repeating a token could satisfy itself from one occurrence. Tokens
  are now de-duplicated before the span sweep, which is the intended semantics.
- The verifier ignored `equivalent_urls`, which `assembleFixture` caught later
  but the report described as verifier behavior. The verifier now checks them.
- ADR-0006 attributed all 192 archived rejections to the verifier. Corrected:
  Codex pre-rejects 77 during derivation and the verifier rejects 115 of the 133
  it judges; 192 is their union.
- The report's manifest byte total was wrong (1,431,951). Corrected to 1,401,827
  with its definition stated.

Verifier tests now number 15 and pin every reported counterexample.

## Verification

`bun test --parallel --isolate benchmarks/teachers`: 60 pass, 0 fail.
`bun run check`: 95 pass, 0 fail. Format, lint, type-aware lint, and typecheck
clean. Both refresh audits pass; the corpus was resealed after each change.

Note for future runs: several process-control tests require `sandbox-exec` and
`/bin/ps` and fail under a restricted sandbox. They pass unsandboxed.

## Next action

Re-run both independent reviews against the corrected state. Do not commit until
both return no blocker or high findings.
