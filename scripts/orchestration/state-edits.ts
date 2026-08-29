import type { Task, TaskState } from "./controller-types.ts";

export function setRootFields(text: string, fields: Record<string, string | number>): string {
  const lines = text.split("\n");
  const firstTable = lines.findIndex((line) => line.startsWith("["));
  const insertAt = firstTable === -1 ? lines.length : firstTable;
  const keys = new Set(Object.keys(fields));
  const filtered = lines.filter((line, index) => {
    if (index >= insertAt) return true;
    const key = line.match(/^([a-z_]+)\s*=/u)?.[1];
    return !key || !keys.has(key);
  });
  const nextTable = filtered.findIndex((line) => line.startsWith("["));
  const values = Object.entries(fields).map(
    ([key, value]) => `${key} = ${typeof value === "number" ? value : JSON.stringify(value)}`,
  );
  filtered.splice(nextTable === -1 ? filtered.length : nextTable, 0, ...values);
  return filtered.join("\n");
}

export function removeRootFields(text: string, fields: string[]): string {
  const keys = new Set(fields);
  const lines = text.split("\n");
  const firstTable = lines.findIndex((line) => line.startsWith("["));
  return lines
    .filter((line, index) => {
      if (firstTable !== -1 && index >= firstTable) return true;
      const key = line.match(/^([a-z_]+)\s*=/u)?.[1];
      return !key || !keys.has(key);
    })
    .join("\n");
}

export function setTaskState(text: string, taskId: string, state: TaskState): string {
  const section = `[tasks.${taskId}]`;
  const start = text.indexOf(section);
  if (start === -1) throw new Error(`Missing task ${taskId}`);
  const end = text.indexOf("\n[tasks.", start + section.length);
  const taskText = text.slice(start, end === -1 ? undefined : end);
  const updated = taskText.replace(/^state = "[^"]+"/mu, `state = "${state}"`);
  return `${text.slice(0, start)}${updated}${end === -1 ? "" : text.slice(end)}`;
}

export function setTaskEvidence(text: string, taskId: string, evidence: string[]): string {
  const section = `[tasks.${taskId}]`;
  const start = text.indexOf(section);
  if (start === -1) throw new Error(`Missing task ${taskId}`);
  const end = text.indexOf("\n[tasks.", start + section.length);
  const taskText = text.slice(start, end === -1 ? undefined : end);
  const updated = taskText.replace(
    /^evidence = \[[^\n]*\]/mu,
    `evidence = ${JSON.stringify(evidence)}`,
  );
  return `${text.slice(0, start)}${updated}${end === -1 ? "" : text.slice(end)}`;
}

export function setTaskAttempts(
  text: string,
  taskId: string,
  attempts: NonNullable<Task["attempts"]>,
): string {
  const section = `[tasks.${taskId}]`;
  const start = text.indexOf(section);
  if (start === -1) throw new Error(`Missing task ${taskId}`);
  const end = text.indexOf("\n[tasks.", start + section.length);
  const taskText = text.slice(start, end === -1 ? undefined : end);
  const value = attempts
    .map(
      (attempt) =>
        `{ attempt = ${attempt.attempt}, branch = ${JSON.stringify(attempt.branch)}, worktree = ${JSON.stringify(attempt.worktree)}, base_sha = ${JSON.stringify(attempt.base_sha)} }`,
    )
    .join(", ");
  const line = `attempts = [${value}]`;
  const updated = /^attempts = \[[^\n]*\]/mu.test(taskText)
    ? taskText.replace(/^attempts = \[[^\n]*\]/mu, line)
    : `${taskText.trimEnd()}\n${line}\n`;
  return `${text.slice(0, start)}${updated}${end === -1 ? "" : text.slice(end)}`;
}

export function setTableString(text: string, table: string, field: string, value: string): string {
  const section = `[${table}]`;
  const start = text.indexOf(section);
  if (start === -1) throw new Error(`Missing table ${table}`);
  const end = text.indexOf("\n[", start + section.length);
  const tableText = text.slice(start, end === -1 ? undefined : end);
  const pattern = new RegExp(`^${field} = "[^"]*"`, "mu");
  const updated = pattern.test(tableText)
    ? tableText.replace(pattern, `${field} = ${JSON.stringify(value)}`)
    : `${tableText.trimEnd()}\n${field} = ${JSON.stringify(value)}\n`;
  return `${text.slice(0, start)}${updated}${end === -1 ? "" : text.slice(end)}`;
}
