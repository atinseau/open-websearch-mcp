/**
 * Historical Claude teacher controls. ADR-0006 removed Claude from current
 * captures; these values exist only to audit the sealed pre-decision refresh
 * and must not be used to launch a new Claude process.
 */
export const legacyClaudeModel = "claude-opus-5[1m]";

export const legacyClaudeDisabledPlugins = {
  enabledPlugins: {
    "typescript-lsp@claude-plugins-official": false,
    "chrome-devtools-mcp@claude-plugins-official": false,
    "rust-analyzer-lsp@claude-plugins-official": false,
    "claude-hud@claude-hud": false,
    "claude-md-management@claude-plugins-official": false,
    "skill-creator@claude-plugins-official": false,
    "pennylane-api@pennylane-mcp": false,
  },
} as const;

export function legacyClaudeIsolationArgs(allowedTools: string): string[] {
  return [
    "--safe-mode",
    "--setting-sources",
    "",
    "--settings",
    JSON.stringify(legacyClaudeDisabledPlugins),
    "--tools",
    allowedTools,
    "--allowedTools",
    allowedTools,
    "--disallowedTools",
    "mcp__*",
    "--permission-mode",
    "dontAsk",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--no-chrome",
    "--no-session-persistence",
  ];
}
