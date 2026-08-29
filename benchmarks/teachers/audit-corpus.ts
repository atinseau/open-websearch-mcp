import { createManifest } from "./audit-artifacts.ts";
import { auditTeacherCorpus } from "./audit-cases.ts";
import { requiredDate } from "./contract-json.ts";
import { commandOutput } from "./process-controls.ts";
import { withRefreshMutation } from "./refresh-lifecycle.ts";

export { createManifest, auditTeacherCorpus };

if (import.meta.main) {
  const date = Bun.argv[2];
  const mode = Bun.argv[3];
  if (date === undefined) {
    throw new Error("usage: bun audit-corpus.ts <YYYY-MM-DD> [--preflight|--write-manifest]");
  }
  requiredDate(date, "audit date");
  const root = import.meta.dir;
  const manifestPath = `${root}/runs/${date}/manifest.json`;
  if (mode === "--write-manifest") {
    const result = await withRefreshMutation(root, date, async () => {
      await auditTeacherCorpus(root, date, false);
      const temporaryManifest = `${manifestPath}.tmp-${crypto.randomUUID()}`;
      try {
        await Bun.write(
          temporaryManifest,
          `${JSON.stringify(await createManifest(root, date), null, 2)}\n`,
        );
        await commandOutput(["/bin/mv", temporaryManifest, manifestPath]);
        return await auditTeacherCorpus(root, date, true);
      } catch (error) {
        if (await Bun.file(manifestPath).exists()) await Bun.file(manifestPath).delete();
        throw error;
      } finally {
        if (await Bun.file(temporaryManifest).exists()) await Bun.file(temporaryManifest).delete();
      }
    });
    console.log(JSON.stringify(result));
  } else {
    console.log(JSON.stringify(await auditTeacherCorpus(root, date, mode !== "--preflight")));
  }
}
