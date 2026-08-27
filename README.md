# Open WebSearch MCP

Local-first, provider-quality Web evidence retrieval for MCP agents using Google
front-end discovery, Obscura JavaScript rendering, and deterministic local
ranking/cache.

Status: **specification complete; product implementation not started**.

- Start with [the master specification](SPEC.md).
- The simple OpenCode control loop starts with [the implementation handoff](docs/orchestration/OPEN-CODE-HANDOFF.md).
- Step tracing and recovery are defined in [ORCHESTRATION.md](ORCHESTRATION.md).
- Research evidence starts with [the architecture report](docs/research/local-websearch-architecture.md).

Target v1: personal macOS ARM64, Bun/TypeScript 7, MCP stdio, public resources
only, no search API and no LLM in the runtime.
