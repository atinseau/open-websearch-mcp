import { defaultConfiguration } from "@/features/configuration/domain/configuration";

/** The only handwritten TOML is the first-run document: comments are user-owned thereafter. */
export function defaultToml(): string {
  const body = Bun.TOML.stringify(defaultConfiguration);
  return (
    "# Open WebSearch MCP configuration. Unknown fields are rejected.\n# Experimental controller settings are intentionally grouped below.\n\n" +
    body
  );
}
