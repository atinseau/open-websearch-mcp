# Initial requirement traceability

This is the pre-implementation ownership map. The controller expands every
range into one row per atomic ID and adds code, test, evidence, PR, commit, and
step-trace links as tasks complete. No range may remain as a substitute for atomic
release traceability.

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
