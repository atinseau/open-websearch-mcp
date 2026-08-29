/** A robots parser adapter. Policy is tested separately from parser syntax. */
export interface RobotsPolicy {
  canCrawl(url: URL, userAgent: string): Promise<boolean>;
}

export type RobotsAccess = "automatic_search" | "explicit_open";

export interface RobotsDecision {
  readonly allowed: boolean;
  readonly ignored: boolean;
  readonly reason?: "robots_disallowed";
}

/** Applies product authority rules after robots parsing. */
export async function decideRobots(
  policy: RobotsPolicy,
  url: URL,
  userAgent: string,
  access: RobotsAccess,
): Promise<RobotsDecision> {
  if (await policy.canCrawl(url, userAgent)) return { allowed: true, ignored: false };
  if (access === "explicit_open")
    return { allowed: true, ignored: true, reason: "robots_disallowed" };
  return { allowed: false, ignored: false, reason: "robots_disallowed" };
}
