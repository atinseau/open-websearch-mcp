import { expect, test } from "bun:test";
import { runController, validateRepository, type OpenCodeRequest } from "./controller";
import { createRepository, task } from "./controller-fixture";

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
  const state = await validateRepository(`${repository}/.worktree/boot-002-a1`);
  expect(task(state, "BOOT-002").state).toBe("verified");
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
  const state = await validateRepository(`${repository}/.worktree/boot-002-a2`);
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
