import type { OrchestrationState } from "./controller-types.ts";
import {
  assertDependencyGraph,
  assertPolicy,
  assertReadiness,
  assertRootShape,
  assertTaskShapes,
} from "./state-schema.ts";
import { assertCurrentTask, assertReferencedFiles } from "./state-current.ts";

export async function validateRepository(repository: string): Promise<OrchestrationState> {
  const root = repository.replace(/[/]$/u, "");
  // The complete schema is checked by the assertions below before this value escapes.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = Bun.TOML.parse(
    await Bun.file(`${root}/docs/orchestration/state.toml`).text(),
  ) as OrchestrationState;

  assertRootShape(state);
  assertPolicy(state);
  assertTaskShapes(state);
  assertDependencyGraph(state);
  assertReadiness(state);
  assertCurrentTask(state);
  await assertReferencedFiles(state, root);
  return state;
}
