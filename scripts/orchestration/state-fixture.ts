import { afterEach } from "bun:test";

const fixtures: string[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await Bun.$`rm -r ${fixture}`.quiet();
  }
});

/** Materializes a throwaway repository whose ledger holds the supplied state. */
export async function createRepository(state: string): Promise<string> {
  const repository = `/tmp/open-websearch-state-${crypto.randomUUID()}`;
  fixtures.push(repository);
  await Bun.$`mkdir -p ${repository}/docs/orchestration/runs/BOOT-001 ${repository}/docs/spec`.quiet();
  await Promise.all([
    Bun.write(`${repository}/docs/orchestration/state.toml`, state),
    Bun.write(`${repository}/docs/orchestration/runs/BOOT-001/0001-done.md`, "# trace\n"),
    Bun.write(`${repository}/docs/spec/task.md`, "# task\n"),
  ]);
  return repository;
}
