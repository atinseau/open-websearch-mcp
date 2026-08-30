# Changelog

## Unreleased

- Release-candidate verification is performed only from `main` and archives the
  exact pins, deterministic gate output, benchmark report, packed tarball,
  SHA-256 digest, packed-artifact MCP smoke test, and generated candidate notes.
- This repository does not publish to npm, create tags, or create GitHub
  Releases automatically. Those externally visible actions require the exact
  `release-authorization` artifact and REL-004.

## 0.1.1 — unreleased candidate

- Local-first MCP stdio server with `web_search` and `web_open`.
- Deterministic discovery, rendering, extraction, ranking, cache, and
  investigation behavior validated by the repository's deterministic suites.
- Not released: the teacher benchmark is now measurable against the
  `2026-08-30` captured corpus (ADR-0013, superseding ADR-0010), but it is
  published for observation and never gates a release, and a live quality
  score is currently blocked by a Google captcha on every discovery request.
