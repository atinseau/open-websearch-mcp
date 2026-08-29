import { expect, test } from "bun:test";
import { runController, validateRepository, type OpenCodeRequest } from "./controller";
import { createRepository, task } from "./controller-fixture";

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

  const rootState = await validateRepository(repository);
  const worktreeState = await validateRepository(`${repository}/.worktree/boot-002-a1`);
  const rootTask = task(rootState, "BOOT-002");
  const worktreeTask = task(worktreeState, "BOOT-002");
  const firstAttempt = worktreeTask.attempts?.[0];
  if (!firstAttempt) throw new Error("Missing first BOOT-002 attempt");
  expect(rootTask.state).toBe("ready");
  expect(worktreeTask.state).toBe("in_progress");
  expect(worktreeState.environment.controller_model).toBe("openai/test-model");
  expect(worktreeState.environment.controller_variant).toBe("high");
  expect(firstAttempt.attempt).toBe(1);
  expect(worktreeTask.evidence).toEqual([
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
  const state = await validateRepository(`${repository}/.worktree/boot-002-a1`);
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
  const state = await validateRepository(`${repository}/.worktree/boot-002-a1`);
  expect(task(state, "BOOT-002").state).toBe("in_progress");
  expect(state.last_trace).toBe("docs/orchestration/runs/BOOT-002/0005-implementation.md");
});

test("runController refuses a second live controller", async () => {
  const repository = await createRepository();
  await Bun.$`mkdir -p ${repository}/.worktree`.quiet();
  await Bun.write(
    `${repository}/.worktree/.controller-lock`,
    JSON.stringify({
      pid: process.pid,
      token: "live-test-owner",
      started_at: new Date().toISOString(),
    }),
  );

  expect(
    runController({
      repository,
      model: "openai/test-model",
      invokeOpenCode: async () => {
        throw new Error("must not run");
      },
    }),
  ).rejects.toThrow("Another controller is already running");
});

test("runController treats an ownerless new lock as an acquisition in progress", async () => {
  const repository = await createRepository();
  await Bun.$`mkdir -p ${repository}/.worktree`.quiet();
  await Bun.write(`${repository}/.worktree/.controller-lock`, "");

  expect(
    runController({
      repository,
      model: "openai/test-model",
      invokeOpenCode: async () => {
        throw new Error("must not run");
      },
    }),
  ).rejects.toThrow("Another controller is acquiring the lock");
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
        const state = await validateRepository(`${repository}/.worktree/boot-002-a1`);
        preparedBeforeInvocation =
          state.current_task === "BOOT-002" &&
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
  const state = await validateRepository(`${repository}/.worktree/boot-002-a1`);
  expect(task(state, "BOOT-002").state).toBe("in_progress");
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
    await Bun.file(
      `${repository}/.worktree/boot-002-a1/docs/orchestration/runs/BOOT-002/0002-failure.md`,
    ).text(),
  ).toContain("blocker evidence");
});
