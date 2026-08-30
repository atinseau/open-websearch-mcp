/**
 * Decides which release steps still need to run, from the authorization, the
 * append-only ledger, and the observed remote state.
 *
 * This module performs no I/O and publishes nothing. It is the decision seam
 * RELEASE-006 requires: a resumed run must complete only its missing steps,
 * accept an already-matching operation idempotently, and refuse outright when
 * the remote disagrees about integrity or commit.
 */
export type ReleaseStep = "npm-publish" | "git-tag" | "github-release";
export type StepState = "succeeded" | "failed" | "in-progress";

export interface Authorization {
  readonly commit: string;
  readonly version: string;
  readonly package: string;
  readonly distTag: string;
  readonly approvedBy: string;
  readonly tarballSha256: string;
}

export interface LedgerEntry {
  readonly step: ReleaseStep;
  readonly state: StepState;
  readonly commit: string;
  readonly version: string;
}

export interface RemoteState {
  readonly npm: { readonly version: string; readonly shasum: string } | undefined;
  readonly tag: string | undefined;
  readonly githubRelease: string | undefined;
}

export interface ReleasePlan {
  readonly steps: readonly ReleaseStep[];
  readonly conflict: string | undefined;
}

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const orderedSteps: readonly ReleaseStep[] = ["npm-publish", "git-tag", "github-release"];

export function planRelease(input: {
  authorization: Authorization;
  ledger: readonly LedgerEntry[];
  remote: RemoteState;
}): ReleasePlan {
  const { authorization, ledger, remote } = input;
  assertAuthorized(authorization);
  const conflict = conflictWith(authorization, ledger, remote);
  if (conflict !== undefined) return { steps: [], conflict };
  return {
    steps: orderedSteps.filter((step) => !isDone(step, authorization, ledger, remote)),
    conflict: undefined,
  };
}

function assertAuthorized(authorization: Authorization): void {
  if (authorization.approvedBy.trim() === "")
    throw new Error("release-authorization names no approving identity");
  if (!semver.test(authorization.version))
    throw new Error(`release-authorization version is not exact SemVer: ${authorization.version}`);
  if (!/^[0-9a-f]{64}$/u.test(authorization.tarballSha256))
    throw new Error("release-authorization carries no tarball SHA-256");
  if (authorization.commit.trim() === "" || authorization.package.trim() === "")
    throw new Error("release-authorization must name an exact commit and package");
}

/**
 * A remote operation that exists but disagrees with the authorization is never
 * overwritten: republishing a version under different content is the failure
 * this ledger exists to prevent.
 */
function conflictWith(
  authorization: Authorization,
  ledger: readonly LedgerEntry[],
  remote: RemoteState,
): string | undefined {
  if (remote.npm && remote.npm.version === authorization.version)
    if (remote.npm.shasum !== authorization.tarballSha256)
      return `published ${authorization.package}@${authorization.version} has different integrity than the authorized tarball`;
  const taggedElsewhere = ledger.find(
    (entry) => entry.step === "git-tag" && entry.commit !== authorization.commit,
  );
  if (remote.tag !== undefined && taggedElsewhere)
    return `tag ${remote.tag} already records commit ${taggedElsewhere.commit}, not the authorized commit ${authorization.commit}`;
  const otherVersion = ledger.find((entry) => entry.version !== authorization.version);
  if (otherVersion)
    return `ledger records version ${otherVersion.version}, not the authorized ${authorization.version}`;
  return undefined;
}

function isDone(
  step: ReleaseStep,
  authorization: Authorization,
  ledger: readonly LedgerEntry[],
  remote: RemoteState,
): boolean {
  const recorded = ledger.some(
    (entry) =>
      entry.step === step && entry.state === "succeeded" && entry.commit === authorization.commit,
  );
  return recorded || presentRemotely(step, authorization, remote);
}

function presentRemotely(
  step: ReleaseStep,
  authorization: Authorization,
  remote: RemoteState,
): boolean {
  if (step === "npm-publish") return remote.npm?.version === authorization.version;
  if (step === "git-tag") return remote.tag === `v${authorization.version}`;
  return remote.githubRelease === `v${authorization.version}`;
}
