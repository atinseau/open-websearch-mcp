import { codexDisabledArgs, codexSkillArgs } from "./policy-controls.ts";
import { commandOutput } from "./process-controls.ts";
import { isolatedTeacherHome, teacherProcessEnvironment } from "./derive-fixture-support.ts";

/** One isolated Codex invocation: its sandbox paths, environment, and argv. */
export type ProbeInvocation = {
  cwd: string;
  prompt: string;
  environment: Record<string, string>;
  args: string[];
};

/**
 * Prepares a hermetic Codex invocation under a throwaway root: private cwd,
 * isolated home and config, a copied credential, and the fixed argv that pins
 * the sandbox, disables persistence, and enables live Web search.
 */
export async function prepareProbeInvocation(input: {
  temporaryRoot: string;
  question: string | undefined;
  promptTemplate: string;
  isCase: boolean;
}): Promise<ProbeInvocation> {
  const cwd = `${input.temporaryRoot}/cwd`;
  const isolatedHome = isolatedTeacherHome(input.temporaryRoot);
  const isolatedConfig = `${input.temporaryRoot}/config`;
  await commandOutput(["/bin/mkdir", "-m", "700", cwd, isolatedHome, isolatedConfig]);

  const commonPrompt = !input.isCase
    ? "Use native Web Search to identify the latest stable Bun release. Cite every factual claim with source URLs. Do not use local files or any non-Web tool."
    : input.promptTemplate.replace("{{question}}", input.question ?? "");

  const environment = teacherProcessEnvironment(isolatedHome, { CODEX_HOME: isolatedConfig });
  const sourceHome = Bun.env.CODEX_HOME ?? `${Bun.env.HOME}/.codex`;
  const sourceAuth = `${sourceHome}/auth.json`;
  if (!(await Bun.file(sourceAuth).exists())) throw new Error("Codex auth.json is missing");
  await commandOutput(["/usr/bin/install", "-m", "600", sourceAuth, `${isolatedConfig}/auth.json`]);
  const args = [
    "exec",
    ...(input.isCase ? ["--model", "gpt-5.4"] : []),
    "--cd",
    cwd,
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--sandbox",
    "read-only",
    "--json",
    "--color",
    "never",
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="live"',
    "-c",
    'history.persistence="none"',
    "-c",
    "project_doc_max_bytes=0",
    ...codexSkillArgs(),
    ...codexDisabledArgs(),
    commonPrompt,
  ];
  return { cwd, prompt: commonPrompt, environment, args };
}
