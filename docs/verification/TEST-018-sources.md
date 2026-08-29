# TEST-018 — reference sources and isolation

This inventory satisfies `TEST-018`: the reference corpus combines deterministic
fixtures, public IR relevance judgements, and live public Google observations.
They have different purposes and must not be conflated.

| Source | Evidence | Isolation | Release role |
| --- | --- | --- | --- |
| Deterministic fixtures | `tests/` fixtures embedded in unit, contract, integration, e2e, security, rendering, storage, ranking, and MCP tests; `benchmarks/teachers/fixtures/` and `benchmarks/grader/` | No live network. `bun test --parallel --isolate` gives each test an isolated workspace/profile/process. The teacher corpus and grader are immutable/versioned and LLM-free at evaluation time. | Required deterministic regression evidence; teacher totals remain `unmeasurable` until ADR-0010’s passage-bearing refresh. |
| BEIR SciFact test qrels | `benchmarks/fixtures/beir-scifact/test-018-subset.json`; original archive URL and SHA-256 are recorded below | Vendored, exact subset of official BEIR SciFact `test.tsv`, `queries.jsonl`, and `corpus.jsonl`. `bun run benchmark:rank:scifact` uses no network and invokes only the lexical ranker. | Informational deterministic ranker measurement, not an arbitrary-query relevance oracle or a promotion threshold. |
| Google canaries | `tests/live/google-canary-corpus.ts` (32 public queries) and `tests/live/google-canaries.test.ts` | Excluded unless `OPEN_WEBSEARCH_LIVE=1`; one Google SERP at a time, 1.5 s delay, 32-query maximum, stops after the first CAPTCHA/block, and writes a report. Normal CI does not run it. | Informational only. CAPTCHA, block, and external errors never alone fail a release (`TEST-025`, `SEARCH-012`). |

## Public qrels provenance and licence

The ranking fixture is an unmodified, minimal selection from the BEIR SciFact
test split: 12 positive qrels across 11 queries and 10 cited documents. It was
downloaded on 2026-08-29 from the BEIR project’s documented SciFact archive:

- Archive: `https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/scifact.zip`
- Archive SHA-256: `536e14446a0ba56ed1398ab1055f39fe852686ecad24a6306c80c490fa8e0165`
- Vendored subset SHA-256: `f9036e9e8b2d6fdc1ca3e40003fd84055e8d9a3e512164ff6164b60be6aedbc0`
- Dataset card licence: CC-BY-SA-4.0 (`https://huggingface.co/datasets/BeIR/scifact-qrels`)
- Benchmark format/provenance: `https://github.com/beir-cellar/beir`

The BEIR project says that constituent datasets retain their own licences;
SciFact’s dataset card declares CC-BY-SA-4.0. This repository preserves that
provenance and does not claim ownership of the texts or relevance judgements.
The subset is deliberately small enough to review and ship, and the evaluator
does not download, call an API, use embeddings, or use an LLM.

## How to reproduce

Run the offline evaluation:

```sh
bun run benchmark:rank:scifact
```

It creates `benchmarks/reports/TEST-018/beir-scifact.json`. Run the opt-in live
observation separately, with an installed pinned Obscura executable:

```sh
OPEN_WEBSEARCH_LIVE=1 BENCHMARK_REPORT_DIR=benchmarks/reports/TEST-018 bun test --isolate tests/live
```

The live command is intentionally absent from `bun run check`. Do not retry a
CAPTCHA aggressively; the report is the evidence, including when Google blocks
the first observation.
