import { withRefreshMutation } from "./refresh-lifecycle.ts";
import { requiredDate } from "./contract-json.ts";
import { commandOutput } from "./process-controls.ts";

export type RefreshInputs = { corpus: unknown; prompt: string };

export async function readRefreshInputs(root: string, date: string): Promise<RefreshInputs> {
  requiredDate(date, "refresh date");
  const directory = `${root}/runs/${date}/inputs`;
  return {
    corpus: await Bun.file(`${directory}/corpus.json`).json(),
    prompt: await Bun.file(`${directory}/prompt.md`).text(),
  };
}

export async function ensureRefreshInputs(root: string, date: string): Promise<RefreshInputs> {
  const existingDirectory = `${root}/runs/${date}/inputs`;
  if (
    (await Bun.file(`${existingDirectory}/corpus.json`).exists()) &&
    (await Bun.file(`${existingDirectory}/prompt.md`).exists())
  ) {
    return readRefreshInputs(root, date);
  }
  await withRefreshMutation(root, date, async () => {
    const parent = `${root}/runs/${date}`;
    const directory = `${parent}/inputs`;
    const corpusPath = `${directory}/corpus.json`;
    const promptPath = `${directory}/prompt.md`;
    const corpusExists = await Bun.file(corpusPath).exists();
    const promptExists = await Bun.file(promptPath).exists();
    if (corpusExists !== promptExists)
      throw new Error(`incomplete refresh input snapshot: ${date}`);
    if (corpusExists) return;
    const corpus = await Bun.file(`${root}/corpus.json`).text();
    const prompt = await Bun.file(`${root}/prompt.md`).text();
    const temporary = `${parent}/.inputs-${crypto.randomUUID()}`;
    await commandOutput(["/bin/mkdir", "-p", parent, temporary]);
    try {
      await Bun.write(`${temporary}/corpus.json`, corpus);
      await Bun.write(`${temporary}/prompt.md`, prompt);
      await commandOutput(["/bin/mv", temporary, directory]);
    } finally {
      await commandOutput(["/bin/rm", "-rf", temporary]);
    }
  });
  return readRefreshInputs(root, date);
}
