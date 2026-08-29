import { record } from "./contract-json.ts";
import { claudeAllowedTools, claudeForbiddenInvocationTypes } from "./probe-shared.ts";

export function inspectNestedToolUses(value: unknown, forbidden: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) inspectNestedToolUses(entry, forbidden);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const object = record(value, "Claude nested event value");
  recordForbiddenInvocation(object, forbidden);
  for (const entry of Object.values(object)) inspectNestedToolUses(entry, forbidden);
}

/** Flags any nested invocation the teacher policy did not permit. */
function recordForbiddenInvocation(object: Record<string, unknown>, forbidden: Set<string>): void {
  recordForbiddenType(object, forbidden);
  recordForbiddenProgress(object, forbidden);
  recordForbiddenToolUse(object, forbidden);
}

function recordForbiddenType(object: Record<string, unknown>, forbidden: Set<string>): void {
  if (object.type === "server_tool_use") {
    forbidden.add(`server_tool_use:${typeof object.name === "string" ? object.name : "unknown"}`);
    return;
  }
  if (typeof object.type !== "string" || !claudeForbiddenInvocationTypes.has(object.type)) return;
  forbidden.add(`${object.type}:${typeof object.name === "string" ? object.name : "unknown"}`);
}

function recordForbiddenProgress(object: Record<string, unknown>, forbidden: Set<string>): void {
  if (object.type !== "tool_progress") return;
  const tool = typeof object.tool_name === "string" ? object.tool_name : "unknown";
  if (!claudeAllowedTools.has(tool)) forbidden.add(`tool_progress:${tool}`);
}

function recordForbiddenToolUse(object: Record<string, unknown>, forbidden: Set<string>): void {
  if (object.type !== "tool_use") return;
  if (typeof object.name !== "string") forbidden.add("tool_use:missing-name");
  else if (!claudeAllowedTools.has(object.name)) forbidden.add(object.name);
}
