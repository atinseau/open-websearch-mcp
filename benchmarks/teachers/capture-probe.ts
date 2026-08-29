import { planProbe } from "./capture-probe-plan.ts";
import { runPlannedProbe, type AcceptedCapture } from "./capture-probe-run-probe.ts";
import { cleanupBeforePublication } from "./derive-fixture-support.ts";
import { publishAcceptedCapture } from "./capture-probe-publication.ts";

type Provider = "codex";

/**
 * Captures one immutable teacher probe. The probe body schedules exactly one
 * publication — a failure archive or the accepted capture — and publication
 * always runs after the temporary root is cleaned, so a partial capture can
 * never reach the sealed corpus.
 */
export async function captureProbe(
  provider: Provider,
  caseId?: string,
  date = Bun.env.TEACHER_REFRESH_DATE ?? new Date().toISOString().slice(0, 10),
): Promise<void> {
  const root = import.meta.dir;
  const plan = await planProbe({ root, provider, caseId, date });
  let acceptedCapture: AcceptedCapture | undefined;
  let pendingPublication: (() => Promise<void>) | undefined;
  let captureFailure: unknown;
  try {
    acceptedCapture = await runPlannedProbe({
      plan,
      provider,
      date,
      schedulePublication: (publish) => {
        pendingPublication = publish;
      },
    });
  } catch (error) {
    captureFailure = error;
  } finally {
    await cleanupBeforePublication(plan.temporaryRoot, async () => {
      const publishFailure = pendingPublication;
      if (publishFailure !== undefined) {
        await publishFailure();
        return;
      }
      const capture = acceptedCapture;
      if (capture !== undefined) await publishAcceptedCapture(plan.target, capture);
    });
  }
  if (captureFailure !== undefined) throw captureFailure;
  if (acceptedCapture === undefined) throw new Error("accepted capture artifacts are unavailable");
}

if (import.meta.main) {
  const provider = Bun.argv[2];
  if (provider !== "codex") {
    throw new Error("usage: bun capture-probe.ts codex [case-id]");
  }
  await captureProbe(provider, Bun.argv[3]);
}
