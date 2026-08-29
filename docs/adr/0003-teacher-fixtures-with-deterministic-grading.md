# Teacher WebSearch fixtures with deterministic grading

Native CLI teacher WebSearch runs establish a versioned high-quality baseline, but no LLM participates after fixture creation or inside the product. Observable traces are curated once into claims, evidence, and acceptable source equivalents; local tests then grade deterministically. This preserves provider-level ambition without making tests nondeterministic, paid per run, or dependent on one teacher's URLs as truth.

ADR-0006 supersedes the two-teacher curation described here: Codex is the single teacher and a deterministic grounding verifier replaces cross-model validation.
