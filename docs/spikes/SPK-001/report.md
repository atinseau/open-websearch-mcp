# SPK-001 teacher corpus report

Date: 2026-08-28

Requirements: `TEST-005`, `TEST-006`, `TEST-007`, `TEST-008`, `TEST-009`,
`TEST-010`, and `TEST-011`.

## Decision

Accept the 2026-08-28 corpus as the current conforming teacher refresh and retain
the sealed 2026-08-27 initial refresh as historical pre-hardening evidence. The
historical Codex policies predate explicit native skill-disable switches, so that
refresh is not evidence for current `TEST-006` skill isolation. The current
corpus contains the required 20 cases, each with one isolated Codex teacher run.
Codex derives a deterministic fixture draft from compacted run evidence; a
deterministic, LLM-free grounding verifier classifies every draft claim; the
checked-in current fixture contains only claims that verifier accepted.

ADR-0006 removed the second CLI teacher. The Claude provider became unusable
mid-refresh after a credential-rotation incident, and the user directed that
Claude be abandoned rather than reauthenticated. The six partial Claude case
captures were retired from the current refresh and archived outside the
repository; the failed Claude policy probes remain retained under
`runs/2026-08-28/failures/`. The historical 2026-08-27 refresh still contains
both teachers and remains auditable through its sealed legacy path.

Use Codex `gpt-5.4` for both refreshes. A retained `gpt-5.6` attempt failed before
Web search because that model was unavailable to the observed ChatGPT-backed
Codex login. This is an authentication/product availability fact, not a quality
comparison between models.

## Environment

- Platform: macOS ARM64.
- Runtime: Bun `1.4.0`.
- Codex: `codex-cli 0.149.1`, model `gpt-5.4`.
- Claude Code: `2.1.247 (Claude Code)`, model `claude-opus-5[1m]`.
- Controller: `openai/gpt-5.6-sol`, default variant.
- Capture date: `2026-08-28`; per-case locale is recorded in `corpus.json` and
  each `run.json`.

Fixture verification uses no model. The deterministic grounding verifier runs
in-process from the archived evidence and draft, so the current refresh has no
verification provider, credential, or budget dependency.

The harness resolves binaries outside `cmux-cli-shims`. Codex runs with a fresh
`HOME`, a fresh `CODEX_HOME` containing only copied authentication, a fresh
non-repository cwd, no persistence, read-only sandboxing, and all non-Web tool
families disabled.
Current accepted Codex runs additionally set `skills.include_instructions=false` and
`skills.bundled.enabled=false`; the accepted policy records therefore exclude
both discovered and bundled skill instructions rather than relying on a fresh
home alone.
Every accepted cwd was empty after the run.

## Measured facts

- Corpus split: 6 technical/docs, 3 current news, 3 academic/primary, 3
  community/contradictory, 3 multilingual, and 2 ambiguous/difficult cases.
- Teacher runs: 20 total, one isolated Codex run per case, with a common prompt
  digest across every case.
- Codex teacher duration: `2,545,036 ms` total.
- Codex drafted 133 candidate claims and pre-rejected 77 more during derivation.
  The verifier accepted 18 of those 133 and rejected 115.
- Final fixtures: 20, containing 18 accepted claims and 192 archived rejected
  claims. The 192 is the union of Codex's 77 draft rejections and the verifier's
  115. Ten cases retain one to four accepted claims; ten cases retain none
  because no drafted claim satisfied the grounding rules.
- This acceptance rate is low and is reported as measured. Earlier, looser
  grounding rules accepted 48 and 56 claims; independent review showed both
  admitted claims containing invented vocabulary, so the rules were tightened
  rather than the corpus enlarged. A Codex-only trace simply supports fewer
  strictly grounded claims than the retired two-teacher corpus did.
- Fixture verification is deterministic and free of model or network calls, so
  re-running it over the archived drafts reproduces both the acceptances and the
  rejection reasons exactly.
- Immutable manifest: 235 artifacts totalling 1,401,827 bytes, each with SHA-256
  and byte count in `benchmarks/teachers/runs/2026-08-28/manifest.json`. The
  total sums the manifest's own `bytes` fields and excludes `manifest.json`,
  which the manifest does not list.
- Contract tests: 60 passing tests and 228 assertions in the teacher suite.
- Full repository suite at acceptance: 95 passing tests and 352 assertions.
- Forbidden calls in the explicitly represented teacher event variants: zero.
- Leaked temporary directories observed by the harness: zero.

## Observable limits

Codex exec JSONL exposes Web-search actions, top-level queries, opened URLs, and
the rendered answer, but version 0.149.1 does not expose the native search result
payload. Codex citations are therefore derived from URLs rendered in its final
answer, while `evidence_passages` remains empty rather than attributing that full
answer to every cited URL.

This is the decisive constraint on a Codex-only corpus. In the retired
two-teacher design, URL-located page passages came from Claude's `WebFetch`
results; a Codex-only trace has none. Grounding is therefore proven against the
fields Codex does expose — final answer, queries, tool-result summaries, opened
and cited URLs, and selected sources — rather than against verbatim passages
that this provider cannot emit. The trace is not claimed to be an oracle or a
complete record of internal search refinements. In particular, Codex 0.149.1
silently omits unsupported item variants, so its JSONL cannot prove a universal
absence of unrepresented tool activity; native policy disables those tool
families.

The fixture evidence file is a bounded deterministic projection of the
`run.json` file. It retains run identity, model, observable queries, tool-result
summaries, opened/cited URLs, sources, bounded passages, and bounded final
answers. The full sanitized teacher trace remains adjacent to each run.
`selected_sources` contains only opened or cited URLs, not every returned search
hit. `evidence_passages` is empty for every current run because Codex exposes no
URL-located page content. The harness never fetches or retains a destination page
body itself, so SPEC-07's prohibition on full page bodies and full runtime
extraction remains unchanged.

## Fixture pipeline

1. `derive-fixtures.ts` supplies the compacted teacher run to Codex with no
   tools, no discovered or bundled skills, and a versioned structured-output
   schema. Trace text is escaped inside an `external_untrusted` JSON block and
   the prompt explicitly treats every directive inside that block as data.
2. Unsupported equivalent URLs and passages that are not verbatim substrings of
   run `evidence_passages` are deterministically removed. The Codex JSONL
   preserves the raw model output; policy, exact evidence projection, normalized
   draft, and failures are archived.
3. `verifyDraftGrounding` classifies every draft claim in-process against one
   lowercase projection of the run's observable fields: final answer, queries,
   tool-result summaries, opened and cited URLs, and selected source URLs and
   titles. A claim is accepted only when all four conditions hold.
   a. Every cited source URL, including equivalent URLs, was observed in the run.
   b. Every distinctive word of the claim text occurs as a whole word in the
   evidence. Distinctive means longer than three characters and not in the
   fixed stop-word list in `fixture-grounding.ts`. There is no partial-match
   tolerance: an earlier 80 percent rule was removed because review showed it
   accepted a claim in which one invented word carried a false assertion.
   c. Every required concept appears either as adjacent words, or as whole-word
   occurrences whose outermost positions span at most 160 characters. The
   span is measured between the outermost matched tokens, so the accepted
   distance is exactly the stated window. Tokenization exists because drafts
   emit prose labels, identifier labels such as `probabilistic_ranking`, and
   abbreviations such as `within_doc_tf` that prose never writes adjacently;
   styling must not decide whether a claim survives. The 160-character bound
   is a readability scale of roughly one to two sentences, chosen so a
   multi-word concept must be expressed in a single local statement rather
   than assembled from unrelated text. It is not calibrated against
   acceptance counts.
   d. Every grading pattern compiles and matches the evidence.
4. The verifier classifies every draft claim exactly once. Its result and policy
   are archived, and `reverify-fixtures.ts` replays the classification from the
   archived drafts whenever a grounding rule changes, without new Codex runs.
5. `assembleFixture` retains only accepted IDs, records the Codex run ID as
   `trace_grounded` provenance, archives all rejection reasons, and rejects any
   source absent from the teacher evidence or any passage not source-located
   within a run passage.
6. `audit-corpus.ts` recomputes every run projection, fixture evidence projection,
   verification, and fixture from raw trace, snapshotted inputs, draft, and
   verdict; validates native command controls and completion metadata; then checks
   the artifact hashes. Because verification is deterministic, the audit recomputes
   it rather than trusting an archived provider response. The pre-snapshot
   2026-08-27 corpus remains auditable with its sealed v1 inspection and
   sanitization semantics; that historical audit preserves provenance but does not
   claim current native skill-control eligibility.

Every external process has a deadline and a per-stream byte ceiling. Teacher
processes are limited to 15 minutes and 64 MiB per stream; auxiliary commands to
30 seconds and 1 MiB. Non-leaf commands cannot create subprocesses under the
macOS process sandbox, and the small closed set of leaf system utilities is
exempt. Corpus capture and interrupted-capture normalization call their internal
routines in-process rather than opening an unsafe nested process boundary. Each
non-leaf command is directly supervised as the no-fork sandbox process and
cannot signal its enclosing Bun process. A deadline, output breach, or I/O
failure sends `SIGKILL` to that supervised process. Any execution failure remains
explicit in policy evidence.

The assembler removes a leading Python-style `(?i)` regex marker because the
deterministic grader compiles every pattern with ECMAScript `iu`; this is a
semantics-preserving representation normalization. Verifier decisions remain
unmodified.
`trace_grounded` identifies Codex derivation plus deterministic grounding
verification. Its guarantee is deliberately narrow and must not be overstated.

It asserts that each cited source URL was observed in the run, that every grading
pattern matches observable evidence, that each required concept appears
adjacently or within one bounded window of that evidence, and that the claim's
distinctive content words are largely present. It is a lexical, answer-level
check.

It does not assert that the claim is true, that the cited source supports the
claim, or that the evidence entails the proposition. Because Codex exposes no
URL-located passages, no claim in this refresh is tied to a specific quoted span
of a specific source; grounding is proven against the run's observable fields as
a whole. This is materially weaker than the URL-located, cross-model curation
that ADR-0003 originally described, and weaker than the two-teacher evidence
retained in the sealed 2026-08-27 refresh. ADR-0006 accepts that reduction; any
consumer of these fixtures must treat them as a reproducible lexical baseline,
never as a source-attribution oracle.

## Retained failures

- `runs/2026-08-27/failures/current-bun-release/codex-gpt-5.6` records the
  unavailable model attempt.
- `runs/2026-08-27/failures/current-bun-release/claude-normalizer-v1` records an
  accepted Claude run that the first normalizer could not project.
- `fixtures/2026-08-27/failures/technical-robots-rfc` records Claude structured
  output being denied by an over-broad tool deny and an unsupported JSON Schema
  meta-schema attempt.
- `fixtures/2026-08-27/failures/technical-pdfjs` records the initial `$0.50`
  Claude verification budget exhaustion. The successful retry used the same
  `$1.00` ceiling as teacher capture.
- `runs/2026-08-27/failures/claude-plugins-v1` and
  `fixtures/2026-08-27/failures/claude-plugins-v1` retain the first complete
  Claude/fixture series rejected by review because init metadata listed local
  plugins. The accepted replacement series explicitly disables those plugins
  and requires an empty init list.
- `runs/2026-08-27/failures/claude-user-language-v2` and
  `fixtures/2026-08-27/failures/claude-user-language-v2` retain the second
  complete series rejected because safe mode alone inherited a user language
  preference. The accepted replacement excludes user/project/local setting
  sources and preserves the requested Spanish and Japanese outputs.
- `fixtures/2026-08-27/failures/technical-url-canonicalization` retains a Claude
  verifier result that classified IDs outside the draft claims array.
- `runs/2026-08-28/failures/probe` retains the Codex and Claude tool-policy
  probes from before the corpus, including the Claude probes that preceded the
  ADR-0006 decision.
- `runs/2026-08-28/failures/current-bun-release` retains six failed Claude
  policy attempts, and `runs/2026-08-28/failures/technical-robots-rfc` retains
  one failed Codex policy attempt.
- The six partial Claude case captures retired from this refresh by ADR-0006 are
  archived outside the repository as
  `/private/tmp/spk-001-claude-retired-2026-08-28.tgz` with SHA-256
  `43a6e179d52e3295e80e42057de517fdef6c8ac874abee3a26a5e4ec5448b4c1` (20 files).
  They are deliberately excluded from the sealed corpus because a partial
  six-of-twenty teacher is not admissible evidence under `TEST-006`, and
  retaining it inside the manifest would imply a second teacher this refresh does
  not have. No current fixture depends on them. The failed Claude policy probes
  that SPEC-01 requires remain inside the repository under
  `runs/2026-08-28/failures/`. This external archive is a convenience copy, not
  the spike's retained failure evidence.

## Refresh policy

Published sealed refreshes are immutable. During unpublished branch assembly, a
review found 1,296 opaque provider `signature` values in the historical
2026-08-27 candidate corpus. The user authorized a correction before its first
published snapshot; it changed exactly those values across 61 artifacts and no
other bytes after signature-value normalization. Its pre-correction run and
fixture trees are backed up outside the repository with SHA-256
`2de668c6e5845e51bafa3a9cffa0969ef22399e7e5f4bdfe4df455b8df51e42b`;
the manifest changed from
`5e0b9d1485d1def132f929b658d5573ab5d051fb93edb7ccb59d38faf0e42611` to
`5c28a1b38b5465cb536c3006571c52628c25a002037e14b19208d442516d00c5`.
The 2026-08-28 corpus was captured for pre-release validation after security and
immutable-refresh hardening. Its history contains superseded intermediate
snapshots: an earlier assembly of this date was labelled `major-prerelease`, and
a still earlier one was a complete two-teacher corpus. Neither was published. The
sealed tree described by this report is the ADR-0006 Codex-only corpus, whose
`refresh.json` records trigger `major-change`. That trigger is supported by a
material teacher-policy change: removal of the second teacher and replacement of
cross-model verification with deterministic grounding. The audit validates the
trigger vocabulary and cadence only; the justifying change is recorded here and
in ADR-0006 rather than proven by the audit.
After a release-gate review found unrelated provider event metadata, the user
explicitly authorized one corrective security pass before publication. The
deterministic sanitizer changed exactly 51 Claude event/envelope artifacts,
replacing 11,900 `uuid` and 759 `signature` values; no run projection, evidence,
draft, verdict, or fixture changed semantically. The pre-correction corpus is
backed up outside the repository with SHA-256
`8f90b64524389ccdc46e36ccd06c94286c08162cc77b42ed07f0eaff3b7ad814`.
A later Spec review found one over-redacted normative `/usr/..` example in a
fragmented Claude input event. The user authorized a targeted correction that
restored only that six-byte-shorter value and regenerated the manifest; every
fixture and every other run artifact remained byte-identical. The immediately
prior corpus is backed up with SHA-256
`e99db502af917d0653c136559b7f9f110fec8ae419a7d1495d4131e6f3cbca0a`; the
manifest changed from
`e20177eab5fcce7973c1e6bd66b3ed5e9cd6c1e605df0952872a1ad80ed13ba4` to final
SHA-256 `a26917d0e652ccbf9eeff9d3a9b6ade329825f2732815076431806df17572837`.
Before publication, the branch was rebuilt from its fixed base so these final
run trees are the only sealed 2026-08-27 and 2026-08-28 snapshots in branch
history; no published run was overwritten.
Create a new dated directory instead of changing the latest refresh
when a teacher provider, selected model, CLI major version, native event shape,
common prompt, or fixture schema changes materially; also refresh for a major
pre-release. Without one of those triggers, refresh no more often than monthly.
Retain each sealed dated tree and its manifested runs, fixtures, failures, and
reports. Capture and fixture derivation refuse to run after `manifest.json`
seals a refresh; the
normalizer uses the same guard. Writers and sealing share one atomic lifecycle
lock whose token, PID, process-start identity, and acquisition time permit safe
ownership checks and recovery after an interrupted process. Each refresh
snapshots its corpus and common prompt inside the manifested dated tree. The
manifest writer performs a complete preflight before writing the manifest.
Rejected attempts are sanitized and written to timestamped failure paths under
that same lock before sealing.

## Commands

```bash
bun capture-probe.ts codex
bun capture-corpus.ts 2026-08-28
bun derive-fixtures.ts 2026-08-28
bun reverify-fixtures.ts 2026-08-28
bun audit-corpus.ts 2026-08-28 --preflight
bun audit-corpus.ts 2026-08-28 --write-manifest
bun x oxfmt --check --disable-nested-config benchmarks/teachers
bun x oxlint --disable-nested-config --deny-warnings benchmarks/teachers
bun x tsc -p benchmarks/teachers/tsconfig.json --noEmit
bun test --parallel --isolate benchmarks/teachers
bun run check
bun pm pack --dry-run --ignore-scripts
```

## Evidence locations

- Corpus, prompt, schemas, harness, and tests: `benchmarks/teachers/`.
- Sanitized teacher traces and policies: `benchmarks/teachers/runs/2026-08-28/`.
- Fixture evidence, model outputs, policies, decisions, and final fixtures:
  `benchmarks/teachers/fixtures/2026-08-28/`.
- Artifact hashes: `benchmarks/teachers/runs/2026-08-28/manifest.json`.
- CLI policy research: `docs/spikes/SPK-001/codex-policy-research.md`. The
  retained `docs/spikes/SPK-001/claude-policy-research.md` documents the teacher
  removed by ADR-0006 and is historical evidence, not current policy.
- Isolation challenge and managed-policy evidence: `docs/spikes/SPK-001/challenge.md`
  and the retained initial-refresh evidence at
  `benchmarks/teachers/runs/2026-08-27/probes/claude/managed-policy-evidence.json`.

## Inferences and deferred work

The corpus proves that the installed Codex CLI can produce isolated observable
teacher runs and a reproducible deterministic fixture contract. It does not
prove that every accepted claim is universally true, that provider-internal
searches are fully observable, or that a future runtime meets the fixture.
Deterministic lexical grading and runtime quality thresholds belong to
`TEST-012` and later verification tasks.

A single teacher also narrows the evidence base. Fixtures now inherit one
provider's view of which sources are authoritative, and grounding is proven
against Codex's observable fields rather than URL-located page passages. ADR-0006
accepts that trade for reproducibility and for removing a credential-handling
hazard; `SPK-004` should report whether extraction decisions prove sensitive to
teacher provider choice.
