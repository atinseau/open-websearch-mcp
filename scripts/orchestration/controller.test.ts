import { afterEach, expect, test } from "bun:test";
import { runController, type OpenCodeRequest } from "./controller";

const fixtures: string[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await Bun.$`rm -r ${fixture}`.quiet();
  }
});

async function createRepository(): Promise<string> {
  const repository = `/tmp/open-websearch-controller-${crypto.randomUUID()}`;
  fixtures.push(repository);
  await Bun.$`mkdir -p ${repository}/docs/orchestration/runs/BOOT-001 ${repository}/docs/spec ${repository}/scripts/orchestration`.quiet();
  await Promise.all([
    Bun.write(`${repository}/.gitignore`, ".worktree/\n"),
    Bun.write(`${repository}/docs/orchestration/runs/BOOT-001/0001-done.md`, "# trace\n"),
    Bun.write(`${repository}/docs/spec/task.md`, "# task\n"),
    Bun.write(`${repository}/scripts/orchestration/validate.ts`, "console.log('valid');\n"),
    Bun.write(`${repository}/scripts/orchestration/smoke.test.ts`, "import { expect, test } from 'bun:test'; test('smoke', () => expect(true).toBe(true));\n"),
    Bun.write(`${repository}/docs/orchestration/state.toml`, `
schema_version = 3
project = "fixture"
state = "active"
spec_revision = "test"
last_trace = "docs/orchestration/runs/BOOT-001/0001-done.md"
[environment]
controller_model = "selected-at-runtime"
[artifacts]
[policy]
max_active_worktrees = 1
max_step_retries = 3
agent_timeout_minutes = 30
trace_after_every_step = true
worktree_root = ".worktree"
[tasks.BOOT-001]
state = "verified"
spec = "docs/spec/task.md"
depends_on = []
write_set = ["docs"]
evidence = ["docs/orchestration/runs/BOOT-001/0001-done.md"]
[tasks.BOOT-002]
state = "ready"
spec = "docs/spec/task.md"
depends_on = ["BOOT-001"]
write_set = ["scripts"]
acceptance_gates = ["command:bun test scripts/orchestration"]
evidence = []
[tasks.BOOT-003]
state = "planned"
spec = "docs/spec/task.md"
depends_on = ["BOOT-002"]
write_set = ["scripts"]
evidence = []
`),
  ]);
  await Bun.$`git init -b main ${repository}`.quiet();
  await Bun.$`git -C ${repository} add .`.quiet();
  await Bun.$`git -C ${repository} -c user.name=Test -c user.email=test@example.com commit -m base`.quiet();
  return repository;
}

test("runController selects one ready task and persists a resumable paused step", async () => {
  const repository = await createRepository();
  let request: OpenCodeRequest | undefined;

  const result = await runController({
    repository,
    model: "openai/test-model",
    variant: "high",
    invokeOpenCode: async (value) => {
      request = value;
      return {
        status: "paused",
        step: "implementation",
        session_id: "session-1",
        summary: "Prepared the implementation",
        changed_paths: [],
        checks: [],
        decisions: ["Keep the change small"],
        findings: [],
        next_action: "Implement the first behavior",
      };
    },
  });

  expect(result.status).toBe("paused");
  expect(request?.task).toBe("BOOT-002");
  expect(request?.cwd).toBe(`${repository}/.worktree/boot-002-a1`);
  expect(request?.model).toBe("openai/test-model");
  expect(request?.variant).toBe("high");

  const rootState = Bun.TOML.parse(await Bun.file(`${repository}/docs/orchestration/state.toml`).text());
  const worktreeState = Bun.TOML.parse(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/state.toml`).text(),
  );
  expect(rootState.tasks["BOOT-002"].state).toBe("ready");
  expect(worktreeState.tasks["BOOT-002"].state).toBe("in_progress");
  expect(worktreeState.environment.controller_model).toBe("openai/test-model");
  expect(worktreeState.environment.controller_variant).toBe("high");
  expect(worktreeState.tasks["BOOT-002"].attempts[0].attempt).toBe(1);
  expect(worktreeState.tasks["BOOT-002"].evidence).toEqual([
    "docs/orchestration/runs/BOOT-002/0001-prepare.md",
    "docs/orchestration/runs/BOOT-002/0002-implementation.md",
  ]);
  expect(worktreeState.current_session).toBe("session-1");
  expect(worktreeState.last_trace).toBe("docs/orchestration/runs/BOOT-002/0002-implementation.md");
  expect(
    await Bun.file(
      `${repository}/.worktree/boot-002-a1/docs/orchestration/runs/BOOT-002/0002-implementation.md`,
    ).text(),
  ).toContain("- Exact next action: Implement the first behavior");
});

test("runController resumes the recorded worktree and explicit OpenCode session", async () => {
  const repository = await createRepository();
  await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async () => ({
      status: "paused",
      step: "implementation",
      session_id: "session-1",
      summary: "Implemented one behavior",
      changed_paths: ["scripts/example.ts"],
      checks: [],
      decisions: [],
      findings: [],
      next_action: "Verify the behavior",
    }),
  });

  let resumedRequest: OpenCodeRequest | undefined;
  await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (request) => {
      resumedRequest = request;
      return {
        status: "paused",
        step: "verification",
        session_id: "session-1",
        summary: "Verified one behavior",
        changed_paths: [],
        checks: [{ command: "bun test", cwd: request.cwd, exit_code: 0 }],
        decisions: [],
        findings: [],
        next_action: "Request review",
      };
    },
  });

  expect(resumedRequest?.cwd).toBe(`${repository}/.worktree/boot-002-a1`);
  expect(resumedRequest?.session_id).toBe("session-1");
  const state = Bun.TOML.parse(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/state.toml`).text(),
  );
  expect(state.current_step).toBe(3);
  expect(state.last_trace).toBe("docs/orchestration/runs/BOOT-002/0003-verification.md");
});

test("runController converts an invalid verification claim into a resumable failure", async () => {
  const repository = await createRepository();
  let calls = 0;
  const result = await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (request) => {
      calls += 1;
      if (calls === 4) {
        return {
          status: "paused",
          step: "implementation",
          session_id: "fresh-session",
          summary: "Changed approach after repeated invalid claims",
          changed_paths: [],
          checks: [],
          decisions: [],
          findings: [],
          next_action: "Continue with the fresh approach",
        };
      }
      return {
        status: "verified",
        step: "verification",
        session_id: "session-1",
        summary: "Claimed completion",
        changed_paths: [],
        checks: [{ command: "bun test", cwd: request.cwd, exit_code: 1, output: "failed" }],
        decisions: [],
        findings: [],
        next_action: "Integrate",
      };
    },
  });

  expect(calls).toBe(4);
  expect(result.status).toBe("paused");
  const state = Bun.TOML.parse(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/state.toml`).text(),
  );
  expect(state.tasks["BOOT-002"].state).toBe("in_progress");
  expect(state.last_trace).toBe("docs/orchestration/runs/BOOT-002/0005-implementation.md");
});

test("runController refuses a second live controller", async () => {
  const repository = await createRepository();
  await Bun.$`mkdir -p ${repository}/.worktree`.quiet();
  await Bun.write(`${repository}/.worktree/.controller-lock`, JSON.stringify({
    pid: process.pid,
    token: "live-test-owner",
    started_at: new Date().toISOString(),
  }));

  expect(runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async () => {
      throw new Error("must not run");
    },
  })).rejects.toThrow("Another controller is already running");
});

test("runController treats an ownerless new lock as an acquisition in progress", async () => {
  const repository = await createRepository();
  await Bun.$`mkdir -p ${repository}/.worktree`.quiet();
  await Bun.write(`${repository}/.worktree/.controller-lock`, "");

  expect(runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async () => {
      throw new Error("must not run");
    },
  })).rejects.toThrow("Another controller is acquiring the lock");
});

test("runController records an OpenCode interruption as resumable failure", async () => {
  const repository = await createRepository();
  let calls = 0;
  let preparedBeforeInvocation = false;
  const result = await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async () => {
      calls += 1;
      if (calls === 1) {
        const state = Bun.TOML.parse(
          await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/state.toml`).text(),
        );
        preparedBeforeInvocation = state.current_task === "BOOT-002" &&
          state.last_trace === "docs/orchestration/runs/BOOT-002/0001-prepare.md";
      }
      const error = new Error("interrupted");
      error.name = "ControllerInterrupted";
      throw error;
    },
  });

  expect(calls).toBe(1);
  expect(preparedBeforeInvocation).toBe(true);
  expect(result.status).toBe("paused");
  expect(result.summary).toContain("interrupted");
  const state = Bun.TOML.parse(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/state.toml`).text(),
  );
  expect(state.tasks["BOOT-002"].state).toBe("in_progress");
  expect(state.last_trace).toBe("docs/orchestration/runs/BOOT-002/0002-failure.md");
});

test("runController rejects an external blocker without exact blocker evidence", async () => {
  const repository = await createRepository();
  let calls = 0;
  const result = await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async () => {
      calls += 1;
      if (calls === 2) {
        return {
          status: "paused",
          step: "implementation",
          session_id: "session-2",
          summary: "Continued after rejecting the false blocker",
          changed_paths: [],
          checks: [],
          decisions: [],
          findings: [],
          next_action: "Continue",
        };
      }
      return {
        status: "blocked_external",
        step: "blocker",
        session_id: "session-1",
        summary: "Work is difficult",
        changed_paths: [],
        checks: [],
        decisions: [],
        findings: [],
        next_action: "Ask for help",
      };
    },
  });

  expect(calls).toBe(2);
  expect(result.status).toBe("paused");
  expect(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/runs/BOOT-002/0002-failure.md`).text(),
  ).toContain("blocker evidence");
});

test("runController starts review in a fresh session before verified completion", async () => {
  const repository = await createRepository();
  const requests: OpenCodeRequest[] = [];
  const result = await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        return {
          status: "review",
          step: "implementation",
          session_id: "implementation-session",
          summary: "Implementation is ready for review",
          changed_paths: ["scripts/example.ts"],
          checks: [{ command: "bun test", cwd: request.cwd, exit_code: 0 }],
          decisions: [],
          findings: [],
          next_action: "Review the implementation",
        };
      }
      return {
        status: "verified",
        step: "review",
        session_id: "review-session",
        summary: "Fresh review accepted the implementation",
        changed_paths: [],
        checks: [{ command: "git status --short", cwd: request.cwd, exit_code: 0 }],
        decisions: [],
        findings: [],
        next_action: "Open the integration PR",
      };
    },
  });

  expect(requests).toHaveLength(2);
  expect(requests[0]?.session_id).toBeUndefined();
  expect(requests[1]?.session_id).toBeUndefined();
  expect(result.status).toBe("verified");
  const state = Bun.TOML.parse(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/state.toml`).text(),
  );
  expect(state.tasks["BOOT-002"].state).toBe("verified");
  expect(state.current_session).toBe("review-session");
});

test("runController advances the attempt when an earlier task branch remains", async () => {
  const repository = await createRepository();
  await Bun.$`git -C ${repository} branch agent/boot-002-a1`.quiet();
  let request: OpenCodeRequest | undefined;

  await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (value) => {
      request = value;
      return {
        status: "paused",
        step: "implementation",
        session_id: "session-2",
        summary: "Started a replacement attempt",
        changed_paths: [],
        checks: [],
        decisions: [],
        findings: [],
        next_action: "Continue attempt two",
      };
    },
  });

  expect(request?.cwd).toBe(`${repository}/.worktree/boot-002-a2`);
  const state = Bun.TOML.parse(
    await Bun.file(`${repository}/.worktree/boot-002-a2/docs/orchestration/state.toml`).text(),
  );
  expect(state.current_attempt).toBe(2);
});

test("runController pauses for explicit user selection when the model is unavailable", async () => {
  const repository = await createRepository();
  let calls = 0;
  const result = await runController({
    repository,
    model: "openai/unavailable",
    invokeOpenCode: async () => {
      calls += 1;
      const error = new Error("model unavailable");
      error.name = "ModelUnavailable";
      throw error;
    },
  });

  expect(calls).toBe(1);
  expect(result.status).toBe("paused");
  expect(result.next_action).toContain("user");
});

test("runController rejects actual changed paths outside the task write set", async () => {
  const repository = await createRepository();
  let calls = 0;
  const result = await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (request) => {
      calls += 1;
      if (calls === 1) {
        await Bun.write(`${request.cwd}/outside.txt`, "unexpected\n");
        await Bun.$`git -C ${request.cwd} add outside.txt`.quiet();
        await Bun.$`git -C ${request.cwd} -c user.name=Test -c user.email=test@example.com commit -m outside`.quiet();
      }
      if (calls === 4) {
        await Bun.$`git -C ${request.cwd} rm outside.txt`.quiet();
        await Bun.$`git -C ${request.cwd} -c user.name=Test -c user.email=test@example.com commit -m revert-outside`.quiet();
      }
      return {
        status: "paused",
        step: "implementation",
        session_id: "session-1",
        summary: "Changed an undeclared file",
        changed_paths: [],
        checks: [],
        decisions: [],
        findings: [],
        next_action: "Continue",
      };
    },
  });

  expect(calls).toBe(4);
  expect(result.status).toBe("paused");
  expect(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/runs/BOOT-002/0002-failure.md`).text(),
  ).toContain("outside.txt");
});

test("runController independently reruns checks before verified completion", async () => {
  const repository = await createRepository();
  let calls = 0;
  const result = await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (request) => {
      calls += 1;
      if (calls === 1) {
        return {
          status: "review",
          step: "implementation",
          session_id: "implementation-session",
          summary: "Ready for review",
          changed_paths: [],
          checks: [],
          decisions: [],
          findings: [],
          next_action: "Review",
        };
      }
      if (calls === 5) {
        return {
          status: "paused",
          step: "implementation",
          session_id: "fresh-session",
          summary: "Changed verification approach",
          changed_paths: [],
          checks: [],
          decisions: [],
          findings: [],
          next_action: "Continue",
        };
      }
      return {
        status: "verified",
        step: "review",
        session_id: `review-session-${calls}`,
        summary: "Claimed passing verification",
        changed_paths: [],
        checks: [{ command: "false", cwd: request.cwd, exit_code: 0 }],
        decisions: [],
        findings: [],
        next_action: "Integrate",
      };
    },
  });

  expect(calls).toBe(5);
  expect(result.status).toBe("paused");
  expect(
    await Bun.file(`${repository}/.worktree/boot-002-a1/docs/orchestration/runs/BOOT-002/0003-failure.md`).text(),
  ).toContain("false");
});

test("runController reconciles a merged verified task before selecting the next planned task", async () => {
  const repository = await createRepository();
  const boot002 = `${repository}/.worktree/boot-002-a1`;
  let boot002Calls = 0;
  await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (request) => {
      boot002Calls += 1;
      return boot002Calls === 1
        ? {
            status: "review",
            step: "implementation",
            session_id: "implementation-session",
            summary: "Ready for review",
            changed_paths: [],
            checks: [],
            decisions: [],
            findings: [],
            next_action: "Review",
          }
        : {
            status: "verified",
            step: "review",
            session_id: "review-session",
            summary: "Reviewed and verified",
            changed_paths: [],
            checks: [{ command: "git status --short", cwd: request.cwd, exit_code: 0 }],
            decisions: [],
            findings: [],
            next_action: "Integrate",
          };
    },
  });
  await Bun.$`git -C ${boot002} add .`.quiet();
  await Bun.$`git -C ${boot002} -c user.name=Test -c user.email=test@example.com commit -m boot002`.quiet();
  await Bun.$`git -C ${repository} merge --ff-only agent/boot-002-a1`.quiet();

  let nextRequest: OpenCodeRequest | undefined;
  await runController({
    repository,
    model: "openai/test-model",
    invokeOpenCode: async (request) => {
      nextRequest = request;
      return {
        status: "paused",
        step: "plan",
        session_id: "boot003-session",
        summary: "Prepared BOOT-003",
        changed_paths: [],
        checks: [],
        decisions: [],
        findings: [],
        next_action: "Implement BOOT-003",
      };
    },
  });

  expect(nextRequest?.task).toBe("BOOT-003");
  expect(nextRequest?.cwd).toBe(`${repository}/.worktree/boot-003-a1`);
  expect(await Bun.file(`${boot002}/docs/orchestration/state.toml`).exists()).toBe(false);
});
