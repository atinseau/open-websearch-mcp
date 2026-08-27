import { validateRepository } from "./controller";

const repoIndex = Bun.argv.indexOf("--repo");
const repository = repoIndex === -1 ? process.cwd() : Bun.argv[repoIndex + 1];
if (!repository) throw new Error("--repo requires a path");

const state = await validateRepository(repository);
console.log(JSON.stringify({
  status: "valid",
  schema_version: state.schema_version,
  tasks: Object.keys(state.tasks).length,
  current_task: state.current_task ?? null,
}));
