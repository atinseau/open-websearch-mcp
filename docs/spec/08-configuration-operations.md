# SPEC-08 — Configuration and operations

## Workspace

All mutable runtime state lives under the user's hidden directory:

```text
~/.open-websearch-mcp/
├── config.toml
├── state.sqlite
├── bin/obscura/<version>/
├── cache/blobs/
├── cache/rendered/
├── cache/extracted/
├── investigations/
├── benchmarks/
├── profiles/
└── logs/
```

SQLite remains the index of metadata and paths. The source repository never
receives runtime cache, downloaded binaries, user config, or production logs.
Tests receive an injected temporary workspace and are forbidden from touching
the real path.

## Configuration lifecycle

Create `config.toml` with comments, defaults, and `schema_version` on the first
Web request. Use native Bun TOML parsing/stringifying. Before each MCP call,
reload only if the file changed, validate with Zod, and freeze an immutable
snapshot for that call. Invalid reload keeps the last valid snapshot and emits
a diagnostic.

Unknown fields are errors. Missing known fields use in-memory defaults. Schema
migration writes a `.bak`, writes a temporary new file, and renames atomically.
An up-to-date file is never rewritten, preserving user comments.

## Default configuration contract

Names may be refined by SPEC review, but every setting below must exist in the
schema and generated file:

```toml
schema_version = 1

[search]
default_max_results = 5
max_results = 10
candidate_budget = 30
timeout_ms = 30000
default_profile = "auto"

[google]
locale = "auto"
max_concurrent_serp = 1
cooldown_ms = 0

[mcp]
max_inbound_message_bytes = 4194304

[renderer]
navigation_timeout_ms = 15000
settle_timeout_ms = 3000
max_download_bytes = 26214400
concurrency = "auto"
initial_concurrency = 8
max_concurrency = 40
max_per_host = 2

[renderer.obscura]
version = "<release-pin>"
variant = "aarch64-macos-stealth"

[cache]
max_bytes = 5368709120
news_ttl_seconds = 900
general_ttl_seconds = 86400
docs_ttl_seconds = 604800
versioned_ttl_seconds = 2592000

[output]
search_passages_per_source = 2
search_passage_chars = 1200
open_default_chars = 12000
open_max_chars = 25000
content_links = 20
navigation_links = 10

[security]
respect_robots_for_search = true
allow_explicit_open_when_robots_disallow = true
public_network_only = true

[logs]
level = "info"
retain_sessions = "forever"
compress_closed_sessions = true

[experimental]
near_duplicate_threshold = 0.90
general_profile_weight = 0.70
specialized_profile_weight = 0.30
passage_weight = 0.35
concept_coverage_weight = 0.20
source_type_weight = 0.15
google_position_weight = 0.15
source_quality_weight = 0.10
freshness_weight = 0.05

[experimental.renderer_controller]
window_completions = 20
window_min_ms = 10000
healthy_windows_before_growth = 2
growth_step = 2
minimum_concurrency = 1
error_decrease_threshold = 0.15
timeout_decrease_threshold = 0.10
p95_baseline_multiplier = 2.0
rss_budget_ratio = 0.80
decrease_factor = 0.50
rss_budget_bytes = 0
```

Zero `rss_budget_bytes` means auto: on each previously unseen Mac, derive a
provisional budget as the smaller of 25% of physical RAM and 4 GiB, then start
at 8 and permit measured growth toward 40. The controller persists observed
warm P95, RSS, and highest healthy capacity to `profiles/machine.toml`, not to
the user config; later processes reuse and continuously revalidate that profile.
Unavailable memory telemetry still permits latency/error-controlled growth but
caps it at the last healthy persisted capacity, or 8 until one healthy window
is observed. Zod bounds fractions to `0..1`, positive sizes/times,
growth/minimum within the renderer maximum, and the MCP message limit to a safe
versioned upper bound. Controller keys are experimental and diagnostics label
them accordingly.

The release pin is generated from the package manifest rather than a mutable
remote `latest`. A user override is diagnosed as unsupported when it has not
passed compatibility probes.

## Logs

Each MCP process creates one timestamped/session-ID JSONL file. Record query,
URLs, scores, decisions, status, sizes, durations, retries, cache provenance,
model-free diagnostics, and errors. Preserve every closed session indefinitely
and compress it after clean close. Never write full page/extracted bodies,
cookies, secrets, auth/session IDs, or sensitive environment data.

If file logging fails, stderr may report startup/fatal diagnostics; stdout
remains exclusively MCP. Logging failure never causes protocol corruption.

## CLI and diagnostics

Invoking the package without a subcommand starts MCP stdio. Minimal maintenance
commands are `doctor` and `benchmark`; an internal config check may be exposed.
No daemon or manual `serve` step exists.

`doctor` verifies exact Bun/platform, config/schema, workspace permissions,
SQLite/WAL/FTS5, Obscura manifest/version/executable, loopback CDP, renderer
probe, free disk, and orphan locks without querying Google.

## Acceptance

Owned requirements: `CONFIG-001` through `CONFIG-006`, `INSTALL-001` through
`INSTALL-003`, and `LOG-001` through `LOG-003`. Acceptance includes first-run,
hot reload, invalid config, migration interruption, concurrent installation,
rollback, disk/log failure, and doctor tests.
