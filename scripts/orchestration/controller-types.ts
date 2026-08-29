export type TaskState =
  | "planned"
  | "ready"
  | "in_progress"
  | "review"
  | "verified"
  | "blocked_external";

export type Task = {
  state: TaskState;
  spec: string;
  depends_on: string[];
  write_set: string[];
  evidence: string[];
  requirements?: string[];
  acceptance_gates?: string[];
  attempts?: Array<{ attempt: number; branch: string; worktree: string; base_sha: string }>;
};

export type OrchestrationState = {
  schema_version: number;
  project: string;
  state: string;
  spec_revision: string;
  last_trace: string;
  environment: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  current_task?: string;
  current_attempt?: number;
  current_worktree?: string;
  current_branch?: string;
  current_base_sha?: string;
  current_session?: string;
  current_step?: number;
  current_head_sha?: string;
  current_reviewed_diff?: string;
  policy: {
    max_active_worktrees: number;
    max_step_retries: number;
    agent_timeout_minutes: number;
    trace_after_every_step: boolean;
    worktree_root: string;
  };
  tasks: Record<string, Task>;
};

export type StepStatus =
  | "ready"
  | "continue"
  | "review"
  | "verified"
  | "paused"
  | "blocked_external"
  | "failed";

export type OpenCodeRequest = {
  task: string;
  cwd: string;
  model: string;
  variant?: string;
  session_id?: string;
  prompt: string;
  timeout_ms: number;
};

export type OpenCodeStepResult = {
  status: StepStatus;
  step:
    | "plan"
    | "implementation"
    | "verification"
    | "review"
    | "integration"
    | "failure"
    | "blocker";
  session_id: string;
  summary: string;
  changed_paths: string[];
  checks: Array<{ command: string; cwd: string; exit_code: number; output?: string }>;
  decisions: string[];
  findings: Array<{ severity: "blocker" | "high" | "medium" | "low"; summary: string }>;
  blocker?: { authority: string; error: string; human_action: string };
  next_action: string;
};

export type ControllerOptions = {
  repository: string;
  model: string;
  variant?: string;
  isInterrupted?: () => boolean;
  invokeOpenCode: (request: OpenCodeRequest) => Promise<OpenCodeStepResult>;
};
