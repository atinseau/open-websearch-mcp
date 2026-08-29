import { withRefreshMutation } from "./refresh-lifecycle.ts";
import {
  failureOutput,
  writeCaptureArtifacts,
  type CaptureTarget,
} from "./capture-probe-publication.ts";

/**
 * Archives a probe the policy inspection rejected and reports the verdict on
 * stdout. The archive is kept because a rejected probe is still evidence of
 * what the provider did; it simply never enters the accepted corpus.
 */
export function scheduleRejectedArchive(input: {
  target: CaptureTarget;
  root: string;
  date: string;
  provider: string;
  caseId: string | undefined;
  startedAt: string;
  exitCode: number;
  inspection: unknown;
  sanitizedEvents: string;
  policy: Record<string, unknown>;
  schedulePublication: (publish: () => Promise<void>) => void;
}): void {
  const { target, root, date, provider, caseId, startedAt } = input;
  const { exitCode, inspection, sanitizedEvents, policy, schedulePublication } = input;
  const archivedOutput = failureOutput(target, startedAt);
  schedulePublication(async () => {
    await withRefreshMutation(root, date, async () => {
      await writeCaptureArtifacts(archivedOutput, sanitizedEvents, policy);
    });
    console.log(
      JSON.stringify({
        provider,
        case_id: caseId,
        output: archivedOutput,
        exit_code: exitCode,
        inspection,
      }),
    );
  });
}
