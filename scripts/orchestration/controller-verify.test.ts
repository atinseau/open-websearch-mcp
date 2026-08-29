import { expect, test } from "bun:test";
import { runController, type OpenCodeRequest } from "./controller";
import { createRepository } from "./controller-fixture";

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
    await Bun.file(
      `${repository}/.worktree/boot-002-a1/docs/orchestration/runs/BOOT-002/0002-failure.md`,
    ).text(),
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
    await Bun.file(
      `${repository}/.worktree/boot-002-a1/docs/orchestration/runs/BOOT-002/0003-failure.md`,
    ).text(),
  ).toContain("false");
});

async function verifyAndMergeBoot002(repository: string): Promise<string> {
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
  return boot002;
}

async function selectBoot003(repository: string): Promise<OpenCodeRequest | undefined> {
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
  return nextRequest;
}

test("runController reconciles a merged verified task before selecting the next planned task", async () => {
  const repository = await createRepository();
  const boot002 = await verifyAndMergeBoot002(repository);
  const nextRequest = await selectBoot003(repository);
  expect(nextRequest?.task).toBe("BOOT-003");
  expect(nextRequest?.cwd).toBe(`${repository}/.worktree/boot-003-a1`);
  expect(await Bun.file(`${boot002}/docs/orchestration/state.toml`).exists()).toBe(false);
});
