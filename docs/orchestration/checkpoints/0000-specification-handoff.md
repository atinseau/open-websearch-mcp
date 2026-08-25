# Checkpoint 0000 — specification handoff

- State: `specified`
- Product implementation: not started by design
- Master spec: `SPEC.md`
- Orchestrator: `ORCHESTRATION.md`
- Requirement registry: `docs/spec/requirements.md`
- Research: `docs/research/`
- OpenCode version observed: `1.18.23`
- Repository: this checkpoint is included in the unique bootstrap root commit
  establishing local `main` and `origin`.
- GitHub: public repository `atinseau/open-websearch-mcp`; refreshed `gh`
  authentication was verified before creation.
- npm authority: intentionally deferred to the release phase.

## Delivered

The brainstorming decisions were transformed into stable requirement IDs,
normative sub-specifications, an executable DAG, model-routing policy,
worktree/PR protocol, challenge/review loop, persistent state, and recovery
protocol. Two independent adversarial reviews then hardened the MCP result
contract, bootstrap/CI ordering, checkpoint transaction, driver/state schemas,
mechanical proof audit, cache privacy boundary, adaptive scheduler, teacher
capture, and idempotent release flow. Research notes remain non-normative
evidence.

## Next action

An OpenCode primary orchestrator starts with `BOOT-002`, verifies this bootstrap
against Git/GitHub facts, implements the durable driver through the first PR,
then executes the remaining DAG. It must not infer that npm authority exists.
