# WEB-007 implementation

- Task: WEB-007
- Branch: `agent/web-007-a1`
- Worktree: `.worktree/web-007`
- Base: `5794e7d`

## Completed work

Implemented a deterministic, lexical two-stage ranker behind the ranking public
feature entrypoint. Pre-render ordering uses lexical title/snippet/URL coverage,
Google position, probable source type, and novelty. Post-extraction ordering
uses the configured experimental weights for evidence passages, concept coverage,
source type, Google position, structural source quality, and conditional
freshness. Profiles are lexical (`auto`, general, technical, news, academic,
community) and blend general/specialized scores from the configuration snapshot.

The normal result projects only candidate identity, score, and confidence.
Diagnostics are opt-in and retain raw SERP positions, component scores, profile,
and configured weights. Freshness receives an application-captured `observedAt`
time, preventing wall-clock nondeterminism for identical ranking input.

## Changed files

- `src/features/ranking/index.ts`
- `src/features/ranking/application/ranker.ts`
- `src/features/ranking/domain/query.ts`
- `src/features/ranking/domain/scoring.ts`
- `src/features/ranking/domain/types.ts`
- `tests/ranking/ranker.test.ts`

## Verification

Passed:

- `bun run format`
- `bun run lint`
- `bun run lint:limits`
- `bun run lint:types`
- `bun run typecheck`
- `bun test --parallel --isolate` (184 passing)
- `bun run check`

## Decisions

- No benchmark threshold was added: WEB-007 supplies scoring mechanics only;
  quality calibration remains owned by VER-001 and ADR-0006.
- No LLM, embedding, model, remote reranker, domain whitelist, or teacher
  conformity field is present in the ranking implementation.

## Blockers

None.

## Next action

Review the diff and integrate this branch through the controller's PR workflow.
