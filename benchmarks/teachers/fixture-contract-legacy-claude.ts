import { array, record, requiredString, type JsonRecord } from "./contract-json.ts";

/**
 * Parses the archived Claude verification envelope of the sealed historical
 * refresh. ADR-0006 removed Claude from current captures; this remains only so
 * the retained pre-decision corpus stays auditable.
 */
export function verificationFromLegacyClaudeEnvelope(
  value: unknown,
  expectedModel: string,
): unknown {
  const envelope = record(value, "Claude verification envelope");
  assertLegacyClaudeCompletion(envelope);
  assertLegacyClaudeUsage(envelope, expectedModel);
  assertLegacyClaudePolicy(envelope);
  assertLegacyClaudeOutput(envelope);
  return envelope.structured_output;
}

function assertLegacyClaudeCompletion(envelope: JsonRecord): void {
  if (
    envelope.type !== "result" ||
    envelope.subtype !== "success" ||
    envelope.is_error !== false ||
    envelope.terminal_reason !== "completed"
  )
    throw new Error("Claude verification envelope did not complete successfully");
}

function assertLegacyClaudeUsage(envelope: JsonRecord, expectedModel: string): void {
  const modelUsage = record(envelope.modelUsage, "Claude verification model usage");
  if (!(expectedModel in modelUsage))
    throw new Error(`Claude verification envelope does not prove model ${expectedModel}`);
  const usage = record(
    modelUsage[expectedModel],
    `Claude verification model usage for ${expectedModel}`,
  );
  const input = [usage.inputTokens, usage.cacheReadInputTokens, usage.cacheCreationInputTokens];
  if (
    input.some((count) => !Number.isInteger(count) || Number(count) < 0) ||
    input.reduce<number>((total, count) => total + Number(count), 0) === 0 ||
    !Number.isInteger(usage.outputTokens) ||
    Number(usage.outputTokens) <= 0
  )
    throw new Error(`Claude verification envelope has invalid ${expectedModel} token usage`);
}

function assertLegacyClaudePolicy(envelope: JsonRecord): void {
  const usage = record(envelope.usage, "Claude verification usage");
  if (
    Object.values(record(usage.server_tool_use, "Claude verification server tool usage")).some(
      (count) => count !== 0,
    )
  )
    throw new Error("Claude verification used a server tool");
  if (array(envelope.permission_denials, "Claude verification permission denials", true).length)
    throw new Error("Claude verification attempted a denied tool");
  if (record(envelope.subagent_stats, "Claude verification subagent stats").spawned !== 0)
    throw new Error("Claude verification spawned a subagent");
}

function assertLegacyClaudeOutput(envelope: JsonRecord): void {
  try {
    const rendered = JSON.parse(requiredString(envelope.result, "Claude verification result"));
    if (JSON.stringify(envelope.structured_output) !== JSON.stringify(rendered))
      throw new Error("Claude verification outputs disagree");
  } catch (error) {
    if (error instanceof Error && error.message === "Claude verification outputs disagree")
      throw error;
    throw new Error("Claude verification result is not JSON", { cause: error });
  }
}
