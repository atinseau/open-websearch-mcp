import {
  decideRobots,
  type RobotsAccess,
  type RobotsPolicy,
} from "@/features/security/domain/robots";
import {
  assessPublicUrl,
  isForbiddenAddress,
  sanitizeOutboundUrl,
  type PublicUrlAssessment,
} from "@/features/security/domain/url-policy";

export interface PublicUrlPolicy {
  assess(url: URL): PublicUrlAssessment;
}
export interface DnsResolver {
  resolve(hostname: string): Promise<readonly string[]>;
}
export interface FetchTransport {
  fetch(input: FetchInput): Promise<TransportResponse>;
}
export interface FetchInput {
  readonly url: URL;
  readonly addresses: readonly string[];
  readonly signal: AbortSignal;
}
export interface TransportResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body?: ReadableStream<Uint8Array>;
}
export interface PublicNetworkOptions {
  readonly resolver: DnsResolver;
  readonly transport: FetchTransport;
  readonly robots?: RobotsPolicy;
  readonly userAgent?: string;
  readonly maximumRedirects?: number;
  readonly maximumBytes?: number;
  readonly maximumDecompressedBytes?: number;
  readonly timeoutMs?: number;
}
export interface SafeFetchResult {
  readonly url: URL;
  readonly body: Uint8Array;
  readonly redirects: readonly URL[];
  readonly canonicalUrl: URL;
  readonly robotsIgnored: boolean;
  readonly trust: "external_untrusted";
}
export interface PublicNetworkClient {
  fetch(url: URL, access: RobotsAccess, signal?: AbortSignal): Promise<SafeFetchResult>;
}

/** Static URL gate; resolver answers and connection targets are checked by the client. */
export { assessPublicUrl, sanitizeOutboundUrl, type PublicUrlAssessment };

/** Removes executable and invisible markup before it can become evidence. */
export function sanitizeExternalHtml(html: string): string {
  // Concealment can be spelled with HTML entities: `display&#58;none` renders
  // exactly like `display:none`. Decode the forms that can disguise a rule
  // before testing, so the check sees what a browser would.
  const withoutActive = decodeConcealmentEntities(html)
    .replace(
      /<(script|style|form|iframe|object|embed|svg|template|noscript)[\s\S]*?<\/\1\s*>/gi,
      "",
    )
    .replace(/<(script|style|form|iframe|object|embed|svg|template|noscript)\b[^>]*\/?\s*>/gi, "")
    .replace(
      // `hidden` must be its own attribute, not the tail of `aria-hidden`, or
      // `aria-hidden=false` would strip visible content. Style values may be
      // unquoted, so the concealment test must not require quotes.
      /<[^>]*(?:\shidden(?=[\s>=])|aria-hidden\s*=\s*["']?true|style\s*=\s*(?:["'][^"']*|[^\s"'>]*)(?:display\s*:\s*none|visibility\s*:\s*hidden))[^>]*>[\s\S]*?<\/[^>]+>/gi,
      "",
    )
    .replace(/\s(?:on\w+|href|src)\s*=\s*(["'])\s*(?:javascript|data|vbscript):[\s\S]*?\1/gi, "");
  return (
    withoutActive
      .replace(/<[^>]+>/g, " ")
      // Collapse runs of spaces and tabs, but keep blank lines: they are the only
      // paragraph boundary the passage grouper has. Flattening every newline made
      // one inline tag in rendered Markdown erase the whole page's structure.
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n[ \n]*\n */g, "\n\n")
      .replace(/ *\n */g, "\n")
      .trim()
  );
}

/** Resolves the entity spellings that can disguise a CSS concealment rule. */
function decodeConcealmentEntities(html: string): string {
  const named: Record<string, string> = {
    "&colon;": ":",
    "&semi;": ";",
    "&lpar;": "(",
    "&rpar;": ")",
  };
  return html.replace(/&#x?[0-9a-f]+;|&[a-z]+;/gi, (entity) => {
    const lowered = entity.toLowerCase();
    const name = named[lowered];
    if (name !== undefined) return name;
    const numeric = /^&#(x)?([0-9a-f]+);$/i.exec(entity);
    if (!numeric) return entity;
    const code = Number.parseInt(numeric[2] ?? "", numeric[1] ? 16 : 10);
    return Number.isFinite(code) && code > 0 && code < 0x11_00_00
      ? String.fromCodePoint(code)
      : entity;
  });
}

export function createPublicNetworkClient(options: PublicNetworkOptions): PublicNetworkClient {
  return { fetch: (url, access, signal) => safeFetch(options, url, access, signal) };
}

async function safeFetch(
  options: PublicNetworkOptions,
  initial: URL,
  access: RobotsAccess,
  externalSignal?: AbortSignal,
): Promise<SafeFetchResult> {
  const redirects: URL[] = [];
  let current = sanitizeAndCheck(initial);
  let robotsIgnored = false;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("network_timeout")),
    options.timeoutMs ?? 15_000,
  );
  const cancel = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      robotsIgnored = (await applyRobots(options, current, access)) || robotsIgnored;
      const response = await fetchValidated(options, current, controller.signal);
      const next = redirectTarget(response, current);
      if (next) {
        enforceRedirectLimit(options, redirects);
        redirects.push(current);
        current = sanitizeAndCheck(next);
        continue;
      }
      return completeResult(response, current, redirects, robotsIgnored, options);
    }
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", cancel);
  }
}

async function applyRobots(
  options: PublicNetworkOptions,
  url: URL,
  access: RobotsAccess,
): Promise<boolean> {
  if (!options.robots) return false;
  const decision = await decideRobots(
    options.robots,
    url,
    options.userAgent ?? "OpenWebSearchMCP",
    access,
  );
  if (!decision.allowed) throw new Error(decision.reason);
  return decision.ignored;
}
function redirectTarget(response: TransportResponse, current: URL): URL | undefined {
  const location = response.headers.get("location");
  return isRedirect(response.status) && location ? new URL(location, current) : undefined;
}
function enforceRedirectLimit(options: PublicNetworkOptions, redirects: readonly URL[]): void {
  if (redirects.length >= (options.maximumRedirects ?? 5)) throw new Error("redirect_limit");
}
async function completeResult(
  response: TransportResponse,
  url: URL,
  redirects: readonly URL[],
  robotsIgnored: boolean,
  options: PublicNetworkOptions,
): Promise<SafeFetchResult> {
  const body = await readBounded(
    response,
    options.maximumBytes ?? 25 * 1024 * 1024,
    options.maximumDecompressedBytes ?? 25 * 1024 * 1024,
  );
  const canonical = response.headers.get("link")?.match(/<([^>]+)>;\s*rel=["']?canonical/i)?.[1];
  return {
    url,
    body,
    redirects,
    canonicalUrl: canonical ? sanitizeAndCheck(new URL(canonical, url)) : url,
    robotsIgnored,
    trust: "external_untrusted",
  };
}

function sanitizeAndCheck(url: URL): URL {
  const result = assessPublicUrl(url);
  if (!result.allowed) throw new Error(result.reason);
  return sanitizeOutboundUrl(url);
}
async function fetchValidated(
  options: PublicNetworkOptions,
  url: URL,
  signal: AbortSignal,
): Promise<TransportResponse> {
  const first = await validateAnswers(options.resolver, url.hostname);
  const second = await validateAnswers(options.resolver, url.hostname);
  if (!sameAddresses(first, second)) throw new Error("dns_rebinding");
  return options.transport.fetch({ url, addresses: second, signal });
}
async function validateAnswers(
  resolver: DnsResolver,
  hostname: string,
): Promise<readonly string[]> {
  const answers = await resolver.resolve(hostname);
  if (answers.length === 0 || answers.some(isForbiddenAddress))
    throw new Error("non_public_dns_answer");
  return answers;
}
async function readBounded(
  response: TransportResponse,
  maxBytes: number,
  maxDecompressedBytes: number,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const encoding = response.headers.get("content-encoding")?.toLowerCase();
  if (!encoding || encoding === "identity") return readStream(response.body, maxBytes);
  const format = compressionFormat(encoding);
  if (!format) throw new Error("unsupported_content_encoding");
  return readStream(response.body.pipeThrough(decompression(format)), maxDecompressedBytes);
}
function compressionFormat(encoding: string): CompressionFormat | undefined {
  if (encoding === "gzip" || encoding === "deflate") return encoding;
  return undefined;
}
function decompression(format: CompressionFormat): ReadableWritablePair<Uint8Array, Uint8Array> {
  // Bun's DOM declarations expose a wider input buffer than pipeThrough accepts.
  // Runtime values are byte streams; keeping this boundary here preserves streaming.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return new DecompressionStream(format) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
}
async function readStream(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error("response_size_limit");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
function sameAddresses(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value) => second.includes(value));
}
function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
