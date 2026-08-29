# FND-001 preparation

Worktree: `.worktree/fnd-001-a1`  
Branch: `agent/fnd-001-a1`  
Base: `02e9c8b37283a12162cabdb7f404cf06125e31fd`

Read: `AGENTS.md`, `SPEC.md`, `CONTEXT.md`, SPEC-02, owned `ARCH-*` and
`ORCH-*` registry entries, `ORCHESTRATION.md`, ADR-0007, and the SPK-002,
SPK-003, and SPK-005 evidence.

Decision: establish only public feature types and real seams. No feature
behavior, scheduler implementation, renderer adapter, storage implementation,
or custom architecture linter is introduced.

ADR-0007 applies: feature-public-boundary, dependency-direction, and
import-declaration-count checks remain normative review obligations, not green
automated gates. Native Oxlint coverage is retained for direct Node imports,
literal and alias cycles, and supported size/complexity limits.
