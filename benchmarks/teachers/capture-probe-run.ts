import { normalizeTeacherRun, validateTeacherRun } from "./contract.ts";

/** The corpus case a probe answered, when the probe targets one. */
export type ProbeCase = { id: string; locale: string };

/**
 * Assembles and validates the durable teacher run for an accepted probe. It
 * returns undefined when the probe was a provider smoke test rather than a
 * corpus case, since only cases produce a run.
 */
export function buildTeacherRun(input: {
  teacherCase: ProbeCase;
  provider: "codex";
  events: unknown[];
  date: string;
  cliVersion: string;
  startedAt: string;
  durationMs: number;
  prompt: string;
  cwdUnchanged: boolean;
  forbiddenToolCalls: unknown;
}): unknown {
  const normalized = normalizeTeacherRun(input.provider, input.events, "gpt-5.4");
  const promptSha256 = new Bun.CryptoHasher("sha256").update(input.prompt).digest("hex");
  const run = {
    schema_version: 1,
    run_id: `${input.date}_${input.provider}_${input.teacherCase.id}`,
    case_id: input.teacherCase.id,
    provider: input.provider,
    ...normalized,
    cli_version: input.cliVersion,
    locale: input.teacherCase.locale,
    started_at: input.startedAt,
    duration_ms: input.durationMs,
    prompt_sha256: promptSha256,
    raw_trace: "events.sanitized.jsonl",
    policy_evidence: "policy.json",
    isolation: {
      temporary_cwd: true,
      cwd_unchanged: input.cwdUnchanged,
      forbidden_tool_calls: input.forbiddenToolCalls,
    },
  };
  validateTeacherRun(run);
  return run;
}
