# SPK-004 step 0001 — prepare

- Task: SPK-004, attempt 1, branch `agent/spk-004-a1`, worktree `.worktree/spk-004-a1`.
- Goal: measure Obscura native rendered Markdown against the sealed 2026-08-28 Codex teacher fixtures.
- Reconciled evidence: SPK-001 reports 18 accepted claims across 10/20 cases and zero URL-located `evidence_passages`; ADR-0006 explicitly warns this corpus may be too thin to calibrate extraction.
- Decision: benchmark URL/claim-pattern and concept coverage plus structure, size and latency, while explicitly declining to infer source-located passage quality from an empty-passage corpus.
- Next action: execute the cache-first, sequential native-Markdown baseline with explicit process cleanup evidence.
