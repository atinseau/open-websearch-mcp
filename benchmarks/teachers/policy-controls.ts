export const codexSkillControls = [
  "skills.include_instructions=false",
  "skills.bundled.enabled=false",
] as const;

export const codexDisabledFeatures = [
  "shell_tool",
  "unified_exec",
  "apps",
  "plugins",
  "remote_plugin",
  "hooks",
  "multi_agent",
  "skill_search",
  "skill_mcp_dependency_install",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "computer_use",
  "image_generation",
  "view_image",
  "tool_suggest",
  "goals",
  "memories",
] as const;

const codexCodeModeFeatures = ["code_mode", "code_mode_host", "code_mode_only"] as const;

export function codexSkillArgs(): string[] {
  return codexSkillControls.flatMap((control) => ["-c", control]);
}

export function codexDisabledArgs(): string[] {
  return codexDisabledFeatures.flatMap((feature) => ["--disable", feature]);
}

export function codexCodeModeDisabledArgs(): string[] {
  return codexCodeModeFeatures.flatMap((feature) => ["--disable", feature]);
}
