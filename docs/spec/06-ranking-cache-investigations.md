# SPEC-06 — Ranking, cache, and investigations

## Two-stage ranking

Pre-render ranking decides what to spend rendering capacity on. It combines
Google position, title/snippet/URL query coverage, inferred source type, and
novelty. It is never presented as final relevance.

Post-render ranking decides what to return. Default weights are:

| Signal | Weight |
| --- | ---: |
| best evidence passage relevance | 35% |
| query concept coverage | 20% |
| source type / intent fit | 15% |
| fused Google position | 15% |
| page quality | 10% |
| conditional freshness | 5% |

Weights are deterministic, versioned, exposed under `[experimental]`, and later
calibrated by grid/champion-challenger search rather than an embedded LLM.

Profiles `general`, `technical`, `news`, `academic`, `community`, and `auto`
apply soft post-extraction boosts only. Final profile score blends 70% general
and 30% profile, falling back to general. Auto-detection never filters
discovery.

## Observable relevance signals

Quality is page-specific: substantial main content, coherent headings,
identifiable authorship/date/version when relevant, original/primary provenance,
citations, and low boilerplate are positive. Thin/repetitive text, title/body
mismatch, ads, copied content, stale claims, and keyword stuffing are penalties.
There is no fixed domain reputation, whitelist, or hard domain diversity limit.

Freshness activates only for observable temporal intent: explicit dates/years,
temporal words, versions, news profile, or Google temporal operators. Date
provenance order is structured metadata, article metadata, coherent visible
date, then HTTP headers. Fetch time is never publication time. Missing dates are
neutral.

Hard rejection is limited to no extractable content, block/error shell, exact
or near duplicate, unsupported unsafe content, or zero query relationship in
title/headings/content/anchors. Otherwise weak evidence may return as
`partial`/`low`.

## Deduplication

Normalize/follow final URL, remove tracking and fragment noise, retain the
original/canonical relationship, then compare exact main-content hash. For
remaining pages use a deterministic shingle SimHash or MinHash implementation;
initial near-duplicate threshold is 90% under `[experimental]`. Group aliases
and select the best accessible/content-complete representative. Unique pages on
one domain remain eligible.

## Storage

`bun:sqlite` in WAL mode stores queries, candidates, ranking features,
extractor/version, timestamps, investigations, consumption/reservations,
headers/hashes, aliases, timings, and paths. Raw/rendered/heavy extracted
content lives in content-addressed files. No PostgreSQL, Redis, Docker, or
external telemetry exists.

Probe FTS5 by compile option and a real temporary FTS table at startup. If
unavailable, Web search and cache continue while advanced local similarity is
disabled with a diagnostic. A configured custom SQLite may be used; Homebrew is
never installed automatically.

Cache freshness honors Cache-Control, ETag, and Last-Modified first. Defaults:
news 15 minutes, general 24 hours, docs 7 days, versioned content 30 days, and
content-hash URLs quasi-immutable. Time-sensitive queries revalidate more
strictly. Local FTS/cache and Google execute concurrently; a fresh local-only
result may return with `discovery: "local_cache"`.

The default LRU budget is 5 GiB. Pin teacher fixtures and active investigations.
Evict downloadable binaries/assets first, then rendered bodies, preserving
extracted text/metadata as long as possible.

## Investigation semantics

Missing `investigation_id` creates a persistent ID. Supplied ID resumes it.
Metadata never expires automatically and survives MCP restarts/cache body
eviction.

Exploration stores a candidate/cache result but does not consume it. Before a
response is emitted, a short SQLite transaction atomically reserves and marks
selected pages consumed. Concurrent calls in one investigation cannot reserve
the same page. Cancellation before reservation leaves it eligible;
cancellation after reservation keeps it consumed, preserving at-most-once
emission.

## Acceptance

Owned requirements: `RANK-004` through `RANK-012` and `CACHE-001` through
`CACHE-011`. Acceptance requires deterministic score fixtures, cache restart and
eviction tests, concurrent same-investigation tests, and explainable diagnostics
for every ranking feature.

