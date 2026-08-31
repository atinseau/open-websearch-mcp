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
   * True when a link is the engine's own product surface — sign-in, help,
   * account, corporate and legal pages — served from a host the engine does
   * not own by name. These links appear on every results page and can never
   * answer a question, so admitting them spends places in a capped candidate
   * pool and pushes real sources out of the results.
   */
  isOwnChrome?(url: URL): boolean;
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

/**
 * Scripts that identify the language a question was written in, so a question
 * that states no locale is still asked in its own language rather than in the
 * one the machine happens to sit in.
 */
const scriptLocales: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "ja-JP"],
  [/[\p{Script=Hangul}]/u, "ko-KR"],
  [/[\p{Script=Han}]/u, "zh-CN"],
  [/[\p{Script=Cyrillic}]/u, "ru-RU"],
  [/[\p{Script=Arabic}]/u, "ar"],
  [/[\p{Script=Hebrew}]/u, "he-IL"],
  [/[\p{Script=Greek}]/u, "el-GR"],
  [/[\p{Script=Thai}]/u, "th-TH"],
  [/[\p{Script=Devanagari}]/u, "hi-IN"],
];

/**
 * The language an engine is asked in.
 *
 * An engine asked without a language answers from where the machine is rather
 * than from what was asked. Measured live from France, Bing answered an
 * English question about PDF.js with a doctor-booking site, a French-English
 * dictionary and a public-health page - three of its ten results, none about
 * PDF.js - while the same query with a stated language returned the project's
 * own documentation first.
 *
 * A locale the agent stated is always sent unchanged. Otherwise the question's
 * own script decides, because that is evidence about what was asked, and the
 * machine's location is not. A question in Latin script falls back to English,
 * which is the language of the specifications such questions ask about.
 */
function requestedLocale(query: string, locale: string | undefined): string {
  if (locale && locale !== "auto") return locale;
  return scriptLocales.find(([script]) => script.test(query))?.[1] ?? "en-US";
}
const duckduckgoHost = /(^|\.)duckduckgo\.com$/iu;
const bingHost = /(^|\.)bing\.com$/iu;

/**
 * Bing's results page links its operator's own surfaces: help, account, the
 * corporate site and the `go.microsoft.com` link forwarder. `learn` and
 * `developer` are deliberately absent — those host documentation that answers
 * real questions and must stay eligible.
 */
const bingChromeHost =
  /^(?:help\.bing|myaccount|account|login|privacy|support|go|www)\.microsoft\.com$/iu;
/** DuckDuckGo's blog and corporate surfaces, which are never results. */
const duckduckgoChromeHost = /(^|\.)(?:spreadprivacy\.com|duck\.com)$/iu;

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
    url.searchParams.set("hl", requestedLocale(query, locale));
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
    url.searchParams.set("kl", requestedLocale(query, locale));
    return url;
  },
  ownsHost: (hostname) => duckduckgoHost.test(hostname),
  isOwnChrome: (url) => duckduckgoChromeHost.test(url.hostname),
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
    url.searchParams.set("setlang", requestedLocale(query, locale));
    return url;
  },
  ownsHost: (hostname) => bingHost.test(hostname),
  isOwnChrome: (url) => bingChromeHost.test(url.hostname),
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
