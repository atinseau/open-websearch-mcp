# Atomic requirement traceability audit

The following range-level map is retained only as historical ownership context.
The VER-004 matrix below is the authoritative one-row-per-ID audit; no range is
treated as a substitute for atomic release traceability.

| Requirement IDs | Normative owner | Primary DAG tasks |
| --- | --- | --- |
| PROD-001..010 | SPEC-00 | BOOT-002, BOOT-003, FND-004, TOOL-001, TOOL-002, VER-004 |
| SEARCH-001..012 | SPEC-04 | WEB-006, TOOL-002, VER-003 |
| RENDER-001..011 | SPEC-05 | SPK-002, SPK-003, WEB-001, WEB-002, WEB-004 |
| EXTRACT-001..013 | SPEC-05 | SPK-004, WEB-005, TOOL-001, TOOL-002 |
| RANK-001..003 | SPEC-04 | WEB-006, WEB-007 |
| RANK-004..012 | SPEC-06 | WEB-007, WEB-008, VER-001 |
| CACHE-001..011 | SPEC-06 | FND-003, FND-004, WEB-008 |
| MCP-001..013 | SPEC-03 | FND-006, TOOL-001, TOOL-002, VER-002 |
| SECURITY-001..011 | SPEC-07 | WEB-003, WEB-004, WEB-005, VER-003 |
| CONFIG-001..006 | SPEC-08 | FND-002 |
| INSTALL-001..003 | SPEC-08 | WEB-001, WEB-002 |
| LOG-001..003 | SPEC-08 | FND-002, VER-003 |
| ORCH-001..008 | SPEC-02 | SPK-003, FND-005, TOOL-001, TOOL-002 |
| ORCH-009..013 | ORCHESTRATION | BOOT-002, every task trace, VER-004 |
| ARCH-001..010 | SPEC-02 | BOOT-003, SPK-005, FND-001, VER-004 |
| TEST-001..025 | SPEC-09 | BOOT-004, all SPK tasks, VER-001..004 |
| RELEASE-001..007 | SPEC-10 | BOOT-001, BOOT-004, REL-001..004 |

## Release invariant

`VER-004` fails if any ID parsed from `docs/spec/requirements.md` lacks exactly
one normative owner and at least one passing verification artifact. Shared work
may satisfy multiple IDs; one ID may have multiple tests. Ownership itself is
single and explicit in the expanded matrix.


## VER-004 atomic audit — 2026-08-29

The table above is preserved as historical pre-implementation context only. This is the authoritative atomic audit for the exact 160 IDs in the registry. Each row identifies the implementation/test location and records whether a release-grade verification artifact exists. Located means the full 232-pass/1-skip suite on 2026-08-29 exercised the named suite; it is not a waiver for the explicit blocked rows.

| ID | Implementation and automated-test location | Verification result |
| --- | --- | --- |
| ARCH-001 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| ARCH-002 | src/; tests/architecture/dependency-graph.test.ts | Enforced by a CI-blocking test; residual limit noted below |
| ARCH-003 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| ARCH-004 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| ARCH-005 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| ARCH-006 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| ARCH-007 | .oxlintrc.jsonc; tests/architecture/quality-limits.test.ts, dependency-graph.test.ts | Enforced repository-wide; residual limit noted below |
| ARCH-008 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| ARCH-009 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| ARCH-010 | src/; tests/architecture/ | Located; linked task traces are the artifact |
| CACHE-001 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-002 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-003 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-004 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-005 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-006 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-007 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-008 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-009 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-010 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CACHE-011 | src/features/storage/; tests/storage/ | Located; linked task traces are the artifact |
| CONFIG-001 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| CONFIG-002 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| CONFIG-003 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| CONFIG-004 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| CONFIG-005 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| CONFIG-006 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| EXTRACT-001 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-002 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | **Verified against a live PDF.** A declared `application/pdf` returns `unsupported_or_ocr_required` with no passages; it previously returned binary bytes as evidence. See WEB-005 trace 0002. |
| EXTRACT-003 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-004 | src/features/extraction/; tests/extraction/extractor-registry.test.ts; tests/security/public-network.test.ts | **Verified adversarially.** Eleven concealment vectors are covered, including unquoted style values, `noscript`, bare `hidden`, entity-encoded rules, and a lying `application/json` content type. `aria-hidden=false` content is proven to survive. |
| EXTRACT-005 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-006 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-007 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-008 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-009 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | **Verified on unstructured pages.** Headingless blocks no longer deduplicate against each other, so navigation chrome cannot displace a page's substantive text. Live `bun.sh/docs` returns five passages, four substantive, where it previously returned one. |
| EXTRACT-010 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-011 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-012 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| EXTRACT-013 | src/features/extraction/; tests/extraction/extractor-registry.test.ts | Located; linked task traces are the artifact |
| INSTALL-001 | src/features/rendering/install/; tests/rendering/installer.test.ts | Located; linked task traces are the artifact |
| INSTALL-002 | src/features/rendering/install/; tests/rendering/installer.test.ts | Located; linked task traces are the artifact |
| INSTALL-003 | src/features/rendering/install/; tests/rendering/installer.test.ts | Located; linked task traces are the artifact |
| LOG-001 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| LOG-002 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| LOG-003 | src/features/configuration/; tests/architecture/configuration.test.ts | Located; linked task traces are the artifact |
| MCP-001 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-002 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-003 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-004 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-005 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-006 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-007 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-008 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; official-SDK contract tests negotiate both supported protocol revisions |
| MCP-009 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-010 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-011 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-012 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| MCP-013 | src/mcp/; tests/mcp/stdio-contract.test.ts | Located; linked task traces are the artifact |
| ORCH-001 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-002 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-003 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-004 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-005 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-006 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-007 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-008 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-009 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-010 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-011 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-012 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| ORCH-013 | src/features/rendering/ and scripts/orchestration/; relevant test suite | Located; linked task traces are the artifact |
| PROD-001 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| PROD-002 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| PROD-003 | src/features/discovery/; tests/discovery/ | Amended by ADR-0014: the configured engines, Google first by default |
| PROD-004 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| PROD-005 | benchmarks/harnesses/2026-08-29-mcp-compatibility-matrix.md | Verified; real Codex stdio registration, tool discovery, and portable `web_search` result (ADR-0012) |
| PROD-006 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| PROD-007 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| PROD-008 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| PROD-009 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| PROD-010 | src/ cross-cutting; e2e/security/MCP suites | Located; linked task traces are the artifact |
| RANK-001 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-002 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-003 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-004 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-005 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-006 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-007 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-008 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-009 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-010 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-011 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RANK-012 | src/features/ranking/; tests/ranking/ranker.test.ts | Located; linked task traces are the artifact |
| RELEASE-001 | package/docs/workflows; package test or workflow inspection | Located; linked task traces are the artifact |
| RELEASE-002 | package/docs/workflows; package test or workflow inspection | Located; linked task traces are the artifact |
| RELEASE-003 | package/docs/workflows; package test or workflow inspection | Located; linked task traces are the artifact |
| RELEASE-004 | package/docs/workflows; package test or workflow inspection | Located; linked task traces are the artifact |
| RELEASE-005 | package/docs/workflows; package test or workflow inspection | Located; linked task traces are the artifact |
| RELEASE-006 | `scripts/release/` driver, ledger and simulation tests; package/docs/workflows | PARTIAL — mechanism and simulation land; publication blocked on external authority, detailed below |
| RELEASE-007 | package/docs/workflows; package test or workflow inspection | Located; linked task traces are the artifact |
| RENDER-001 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-002 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-003 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-004 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-005 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-006 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-007 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-008 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-009 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-010 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| RENDER-011 | src/features/rendering/; rendering/download tests | Located; linked task traces are the artifact |
| SEARCH-001 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-002 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-003 | src/features/discovery/; tests/discovery/google-discovery.test.ts | UNMET — detailed below |
| SEARCH-004 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-005 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-006 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-007 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-008 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-009 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-010 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-011 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SEARCH-012 | src/features/discovery/; tests/discovery/google-discovery.test.ts | Located; linked task traces are the artifact |
| SECURITY-001 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-002 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-003 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-004 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-005 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-006 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-007 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-008 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-009 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-010 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| SECURITY-011 | src/features/security/; tests/security/ | Located; linked task traces are the artifact |
| TEST-001 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-002 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-003 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-004 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-005 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-006 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-007 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-008 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-009 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-010 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-011 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-012 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-013 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-014 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-015 | benchmarks/ or tests/; verification suite | BLOCKED — detailed below |
| TEST-016 | benchmarks/ or tests/; verification suite | BLOCKED — detailed below |
| TEST-017 | benchmarks/ or tests/; verification suite | BLOCKED — detailed below |
| TEST-018 | benchmarks/ or tests/; verification suite | BLOCKED — detailed below |
| TEST-019 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-020 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-021 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-022 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-023 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |
| TEST-024 | benchmarks/ or tests/; verification suite | BLOCKED — detailed below |
| TEST-025 | benchmarks/ or tests/; verification suite | Located; linked task traces are the artifact |

### Explicit gaps

- **SEARCH-003:** the discovery connector reports a persistent Google profile, but the renderer opens every target with an ephemeral data store, so the persistent profile it promises does not exist at runtime. Confirmed not to be the cause of the Google CAPTCHA. Tracked as its own ticket.

- **ARCH-002:** enforced, with a recorded limit. `tests/architecture/dependency-graph.test.ts` reads the real import graph of `src` and fails CI when one feature reaches past another's public index, or when a computed dynamic import could hide such a reach. Per ADR-0007 this is a test rather than a linter plugin, so it covers `src` only and would not catch a violation introduced outside it.
- **ARCH-007:** enforced, with a recorded limit. The numeric limits (300 lines, 60 lines per function, complexity 10, depth 4, 5 parameters) live in the root `.oxlintrc.jsonc` and `lint:limits` runs over `src scripts tests benchmarks`; ADR-0008's debt is cleared and `src/.oxlintrc.jsonc` was deleted so no narrower configuration can apply. Positive and negative fixtures prove each threshold rejects what it should (`tests/architecture/quality-limits.test.ts`). The 12-import ceiling is enforced by test rather than lint, because `import/max-dependencies` is unsupported by the linter (SPK-005), and that test covers `src` only.
- **PROD-005 scope:** ADR-0012 verifies portability with Codex only. Claude Code and Gemini CLI are outside the verified-harness scope for recorded external reasons; the preserved OpenCode run is historical independence evidence, not supported-harness evidence. Official-SDK contract tests still exercise MCP `2024-11-05` and `2025-06-18`, so this limitation is not implementation coupling to Codex.
- **RELEASE-006:** partially satisfied. The authorization parser, idempotent publish ledger, and resume driver exist and are gated, and the criterion's required simulation — npm success followed by GitHub failure, resuming without republication — is an executable test in `scripts/release/publish-driver.test.ts`. Not satisfied: no signed release authorization, npm publish, tag, or GitHub Release exists. REL-004 is `blocked_external` on human authorization and npm credentials.
- **TEST-015–017:** ADR-0013 supersedes ADR-0010: the `2026-08-30` corpus carries URL-located passages for 8 of 18 accepted claims, so the scorer is calculable. Its thresholds still cannot pass: the sample is too small to gate on, and every live search is currently refused by a Google captcha and reported `blocked` rather than scored.
- **TEST-018:** no evidence for required BEIR/TREC/BRIGHT cases and 30–50 live canaries; only the small teacher corpus and two opt-in canaries exist.
- **TEST-024:** the workflow gates code and packaging but cannot claim benchmark threshold compliance while TEST-015–017 are unmeasurable.
