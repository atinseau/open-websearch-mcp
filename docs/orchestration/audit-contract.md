# Mechanical orchestration audit

Agent prose is never proof. `BOOT-002` implements a Bun audit command that the
driver and required PR CI run against every attempt and checkpoint transaction.

For a task PR it must:

1. resolve base/head SHAs and reject every changed path outside the normalized
   write set (task-local plan, reviews, evidence, and checkpoint proposal paths
   are scoped automatically to that task ID);
2. require schema-valid plan, independent challenge, implementation result,
   spec review, quality/security review, and clean verification result;
3. prove role/session separation from attempt identities; high-risk tasks also
   prove a different model family when the roster permits it;
4. rerun declared gates and capture argv, cwd, exit status, timestamps, and
   SHA-256 hashes rather than trusting pasted output;
5. verify clean committed status, current base, no secrets, no forbidden Node
   imports/tooling, and no undeclared generated files;
6. map every owned requirement to its expected proof and reject missing or
   duplicate primary ownership.

For checkpoint transactions it additionally verifies that existing checkpoint
files are byte-identical, exactly one next-numbered checkpoint is added, its
`previous` hash matches the chain head, source task/PR/merge SHA are factual,
and the state transition is `integrated_pending_checkpoint → verified`.

Branch protection requires this audit after BOOT-001 installs the minimal
workflow. A failed or unavailable audit cannot be replaced by an agent-authored
Markdown verdict.

## Root-of-trust promotion

BOOT-002 cannot certify itself. Its PR is checked by the bootstrap validator
read from the PR base SHA and committed by BOOT-001. That validator accepts only
the fixed BOOT-002 scope/capabilities and proves two reviewer identities and
session-export hashes. After merge, a separate checkpoint transaction verifies
the installed audit against its contract; only then does branch protection use
the new audit for later PRs. Subsequent audit changes are high-risk tasks checked
by the previous `main` version, never solely by the proposed version.

## Command and capability policy

Every task has a reviewed capability manifest. It enumerates exact executable
and argv prefixes, cwd roots, writable roots, network class, readable credential
roots, Git/GitHub operations, and maximum duration/output. Default is no network,
no credential reads, no external writes, no push/merge/release/publish, and
worktree-only writes. The auditor rejects undeclared commands before execution.

The driver runs agents and reproduced gates through a macOS sandbox profile
generated from that manifest and validated by BOOT-002 escape fixtures. Network
tasks may receive outbound network without access to user credential stores.
Only the orchestrator owns GitHub integration. Only an exact verified
release-authorization can grant the release executor narrowly scoped npm/tag/
GitHub Release operations. Package scripts are inspected as transitive command
capabilities; allowing `bun run <name>` does not implicitly allow arbitrary
executables or paths invoked by that script.
