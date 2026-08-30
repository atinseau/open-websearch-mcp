# Narrow the verified compatibility matrix to Codex

Status: accepted

Amends `PROD-005`. It does not change the MCP server implementation, its
supported protocol revisions, or the official-SDK contract tests.

## Context

`PROD-005` required a compatibility matrix for Codex, Claude Code, Gemini CLI,
and OpenCode. The requirement could not be verified as written for reasons
outside the product:

- the Claude Code CLI is absent; ADR-0006 records that its prior session was
  revoked and that an agent must not reauthenticate it;
- Gemini CLI accepts the stdio registration but every headless turn ends with
  the account's `429 RESOURCE_EXHAUSTED` quota response and chooses its own
  `google_web_search` rather than the registered MCP tool.

The completed Codex stdio probe is real and reproducible. The completed
OpenCode probe is also real historical evidence, but it is not a supported
harness claim. Leaving the old requirement while editing the matrix to look
complete would silently weaken a gate, which the project rules forbid.

## Decision

Amend `PROD-005` to require one verified compatibility matrix for Codex. Its
acceptance criterion is a real stdio registration, tool discovery, and one
completed `web_search` call returning a portable textual result.

The compatibility matrix records Claude Code and Gemini CLI as outside the
verified-harness scope, with their external blocking reasons. It keeps the
existing OpenCode result in a clearly separated historical annex. That annex
is evidence of client independence observed at the time of the probe; it is
never a claim that OpenCode is supported.

## Cost

Portability is now verified against one client only. The project must not claim
broad harness support as though it were measured.

The official MCP SDK contract tests still negotiate both supported protocol
revisions, `2024-11-05` and `2025-06-18`, against real stdio child processes.
Consequently the server is not coupled to Codex in its implementation. Those
tests do not, however, replace measurement by multiple client harnesses.

## Returning a harness to scope

A harness returns to the verified matrix only after a new real stdio probe
records registration, tool discovery, and a completed portable `web_search`
result. Its external preconditions must first hold:

- Claude Code: its CLI is installed and a human, not an agent, has
  authenticated the session;
- Gemini CLI: its account has usable quota;
- any other harness: its CLI is installed and usable without violating an
  existing ADR or credential-handling constraint.

Adding a verified harness requires updating `PROD-005`, the compatibility
matrix, traceability, and release readiness together; no document may make the
claim alone.
