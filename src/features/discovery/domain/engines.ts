import type { EngineName } from "./engine-names.ts";

/**
 * What distinguishes one search engine from another when reading its results
 * page. Everything else — candidate admission, advertisement rejection, source
 * typing, blocked-marker detection — is shared, because it is a property of
 * public search results rather than of any one engine.
 */
export interface SearchEngine {
  readonly name: EngineName;
  /** Builds the results-page URL for a query, without rewriting the query. */
  searchUrl(query: string, locale?: string): URL;
  /** True when a link belongs to the engine's own site rather than a result. */
  ownsHost(hostname: string): boolean;
  /**
   * Recovers the real destination from an engine result link. Engines wrap
   * results in a redirect carrying the destination in a query parameter.
   * Returns undefined for an engine link that is not a result wrapper.
   */
  dereference(link: URL): URL | undefined;
  /** Engine-specific blocked markers, added to the shared ones. */
  readonly blockedMarkers?: ReadonlyArray<readonly [RegExp, BlockedReason]>;
}

export type BlockedReason = "captcha" | "waf" | "consent_required";

const googleHost = /(^|\.)google\.[a-z.]+$/iu;
const duckduckgoHost = /(^|\.)duckduckgo\.com$/iu;
const bingHost = /(^|\.)bing\.com$/iu;

/** Recovers a destination carried in one of the named query parameters. */
export function parameterDestination(link: URL, parameters: readonly string[]): URL | undefined {
  for (const parameter of parameters) {
    const target = link.searchParams.get(parameter);
    if (!target) continue;
    try {
      return new URL(target);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const googleEngine: SearchEngine = {
  name: "google",
  searchUrl(query, locale) {
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", query);
    if (locale && locale !== "auto") url.searchParams.set("hl", locale);
    return url;
  },
  ownsHost: (hostname) => googleHost.test(hostname),
  dereference(link) {
    if (!/^\/(?:url|imgres)$/u.test(link.pathname)) return undefined;
    return parameterDestination(link, ["q", "url"]);
  },
};

/**
 * DuckDuckGo's HTML endpoint, which returns a server-rendered results page.
 * Every result link is wrapped in `/l/?uddg=<encoded destination>`, so the
 * destination is recovered exactly as it is for Google.
 */
export const duckduckgoEngine: SearchEngine = {
  name: "duckduckgo",
  searchUrl(query, locale) {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);
    if (locale && locale !== "auto") url.searchParams.set("kl", locale);
    return url;
  },
  ownsHost: (hostname) => duckduckgoHost.test(hostname),
  dereference(link) {
    if (link.pathname !== "/l/") return undefined;
    return parameterDestination(link, ["uddg"]);
  },
  blockedMarkers: [[/anomaly|blocked for abuse/iu, "waf"]],
};

/**
 * Bing wraps every result in `/ck/a?...u=a1<base64url>`. Unlike Google and
 * DuckDuckGo it encodes the destination rather than passing it through, so the
 * marker is stripped and the remainder decoded.
 */
export const bingEngine: SearchEngine = {
  name: "bing",
  searchUrl(query, locale) {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", query);
    if (locale && locale !== "auto") url.searchParams.set("setlang", locale);
    return url;
  },
  ownsHost: (hostname) => bingHost.test(hostname),
  dereference(link) {
    if (link.pathname !== "/ck/a") return undefined;
    const encoded = link.searchParams.get("u");
    if (!encoded?.startsWith("a1")) return undefined;
    const decoded = decodeBase64Url(encoded.slice(2));
    // A relative path is one of Bing's own surfaces (images, maps, videos),
    // never a result destination.
    if (!decoded?.startsWith("http")) return undefined;
    try {
      return new URL(decoded);
    } catch {
      return undefined;
    }
  },
  blockedMarkers: [[/made us think you were a bot|unusual activity/iu, "captcha"]],
};

function decodeBase64Url(value: string): string | undefined {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  try {
    return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return undefined;
  }
}
