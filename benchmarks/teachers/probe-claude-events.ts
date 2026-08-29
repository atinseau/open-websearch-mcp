/** Recognizes the Claude result text that reports an authentication failure. */
export function claudeAuthenticationFailed(event: Record<string, unknown>): boolean {
  const result = typeof event.result === "string" ? event.result : "";
  return /failed to authenticate|oauth session expired/i.test(result);
}

/** Any hook event is forbidden: a probe must observe the provider, not extend it. */
export function collectClaudeHook(event: Record<string, unknown>, forbidden: Set<string>): void {
  if (typeof event.type === "string" && event.type.startsWith("hook_")) forbidden.add(event.type);
}
