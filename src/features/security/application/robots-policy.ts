import { assessPublicUrl } from "@/features/security/domain/url-policy";
import type { RobotsPolicy } from "@/features/security/domain/robots";
import { validateAnswers, type DnsResolver } from "./public-network.ts";

export interface RobotsPolicyOptions {
  readonly fetch?: RobotsFetch;
  /**
   * Resolver used to prove the robots host is public before connecting. The
   * static URL check alone cannot see where a public hostname resolves, so
   * without this a site can point its own robots lookup at a private address.
   */
  readonly resolver?: DnsResolver;
}

type RobotsFetch = (input: URL, init: RequestInit) => Promise<Response>;

/** Fetches and evaluates a site's robots file for the product user agent. */
export function createRobotsPolicy(options: RobotsPolicyOptions = {}): RobotsPolicy {
  const request = options.fetch ?? fetch;
  return {
    canCrawl: (url, userAgent) => canCrawl(request, options.resolver, url, userAgent),
  };
}

async function canCrawl(
  request: RobotsFetch,
  resolver: DnsResolver | undefined,
  url: URL,
  userAgent: string,
): Promise<boolean> {
  const robots = new URL("/robots.txt", url);
  if (!assessPublicUrl(robots).allowed) return false;
  try {
    if (resolver) await validateAnswers(resolver, robots.hostname);
    const response = await request(robots, {
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404 || response.status === 410) return true;
    if (!response.ok) return false;
    return permits(await response.text(), url.pathname, userAgent);
  } catch {
    return false;
  }
}

function permits(source: string, path: string, userAgent: string): boolean {
  const rules = rulesFor(source, userAgent);
  let decision: boolean | undefined;
  let longest = -1;
  for (const rule of rules) {
    if (!path.startsWith(rule.path) || rule.path.length < longest) continue;
    longest = rule.path.length;
    decision = rule.allow;
  }
  return decision ?? true;
}

function rulesFor(
  source: string,
  userAgent: string,
): readonly { readonly allow: boolean; readonly path: string }[] {
  const rules: { allow: boolean; path: string }[] = [];
  let applies = false;
  for (const original of source.split("\n")) {
    const line = original.replace(/#.*/u, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === "user-agent")
      applies = value === "*" || value.toLowerCase() === userAgent.toLowerCase();
    if (applies && (name === "allow" || name === "disallow") && value)
      rules.push({ allow: name === "allow", path: value });
  }
  return rules;
}
