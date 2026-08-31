import type {
  RenderedDocument,
  RenderedLink,
  RenderRequest,
  Renderer,
  RenderView,
  WebViewRendererOptions,
} from "@/features/rendering";
import { conditionalHeaders } from "./webview-headers.ts";
import { closeQuietly } from "./webview-close.ts";
import { monitorTransfer } from "./webview-transfer.ts";

type LinkValue = { readonly href?: unknown; readonly text?: unknown };

/** The selected adapter: each destination gets one ephemeral WebView target. */
export class WebViewRenderer implements Renderer {
  readonly #options: WebViewRendererOptions;

  constructor(options: WebViewRendererOptions) {
    this.#options = options;
  }

  render(request: RenderRequest): Promise<RenderedDocument> {
    assertPublic(this.#options.policy, request.url);
    return this.#options.scheduler.schedule(
      {
        investigationId: request.investigationId,
        host: request.url.hostname,
        kind: request.kind,
        explicitOpen: request.explicitOpen,
        signal: request.signal,
        timeoutMs: this.#options.configuration.navigationTimeoutMs,
      },
      (signal) => this.#renderTarget(request.url, signal, request.conditional),
    );
  }

  #openView(): RenderView {
    return (
      this.#options.openView?.() ??
      new Bun.WebView({
        backend: { type: "chrome", url: this.#options.endpoint.cdpUrl.toString() },
        dataStore: "ephemeral",
      })
    );
  }

  async #renderTarget(
    url: URL,
    signal: AbortSignal,
    conditional?: RenderRequest["conditional"],
  ): Promise<RenderedDocument> {
    const view = this.#openView();
    const monitor = monitorTransfer(view, this.#options.configuration.maxDownloadBytes);
    const cancel = () => closeQuietly(view);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await this.#navigate(view, url, signal, monitor.exceeded, conditional);
      // A confirmed copy carries no new body: the caller keeps what it stored.
      if (monitor.notModified())
        return {
          url,
          text: "",
          markdown: "",
          links: [],
          notModified: true,
          diagnostics: { title: view.title, transferBytes: monitor.bytes(), settledMs: 0 },
        };
      const settledAt = Date.now();
      await pause(this.#options.configuration.settleTimeoutMs, signal);
      if (monitor.exceeded()) throw new Error("download_budget_exceeded");
      const document = await documentFrom(view, url, settledAt, {
        transferBytes: monitor.bytes(),
        contentType: monitor.contentType(),
        cacheHeaders: monitor.cacheHeaders(),
      });
      // WebView resolves redirects internally. Rejecting the resolved URL prevents any
      // redirected document from becoming evidence; production Obscura itself has no
      // private-network exemption, so a private redirect cannot be loaded either.
      assertPublic(this.#options.policy, document.url);
      return document;
    } finally {
      signal.removeEventListener("abort", cancel);
      monitor.stop();
      closeQuietly(view);
    }
  }

  async #navigate(
    view: RenderView,
    url: URL,
    signal: AbortSignal,
    exceeded: () => boolean,
    conditional?: RenderRequest["conditional"],
  ): Promise<void> {
    await view.navigate("about:blank");
    assertPublic(this.#options.policy, url);
    await view.cdp("Network.enable");
    // CDP is the only place a browser navigation can carry request headers, so
    // this is where a stored copy's validators become a conditional request.
    const validators = conditionalHeaders(conditional);
    if (validators) await view.cdp("Network.setExtraHTTPHeaders", { headers: validators });
    try {
      await raceAbort(view.navigate(url.toString()), signal);
    } catch (error) {
      if (exceeded()) throw new Error("download_budget_exceeded", { cause: error });
      throw error;
    }
    if (exceeded()) throw new Error("download_budget_exceeded");
  }
}

function assertPublic(policy: WebViewRendererOptions["policy"], url: URL): void {
  const assessment = policy.assess(url);
  if (!assessment.allowed) throw new Error(assessment.reason ?? "non_public_destination");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function documentFrom(
  view: RenderView,
  url: URL,
  settledAt: number,
  observed: {
    readonly transferBytes: number;
    readonly contentType: string | undefined;
    readonly cacheHeaders: Readonly<Record<string, string>>;
  },
): Promise<RenderedDocument> {
  const evaluated = await view.evaluate(
    // `innerText` on the live body captures inline script and style bodies on
    // pages that inject them as visible-but-unstyled nodes, and that text then
    // becomes "evidence". Strip non-content nodes from a detached clone first;
    // links are still read from the live document so hrefs stay resolved.
    "(() => { const body = document.body; let text = ''; if (body) { const clone = body.cloneNode(true); for (const n of clone.querySelectorAll('script,style,noscript,template,svg')) n.remove(); text = clone.innerText || clone.textContent || ''; } return { text, location: document.location.href, links: Array.from(document.links, link => ({ href: link.href, text: link.innerText || link.textContent || '' })) }; })()",
  );
  const content = isRecord(evaluated) ? evaluated : {};
  const text = typeof content.text === "string" ? content.text : "";
  return {
    url: settledUrl(content.location, view.url, url),
    text,
    markdown: text,
    links: links(content.links),
    contentType: observed.contentType,
    cacheHeaders: observed.cacheHeaders,
    diagnostics: {
      title: view.title,
      transferBytes: observed.transferBytes,
      settledMs: Date.now() - settledAt,
    },
  };
}

function links(value: unknown): readonly RenderedLink[] {
  return linksFrom(value);
}

/**
 * The address of the page the text came from.
 *
 * `view.url` reports whichever frame settled last, so a page embedding a
 * third-party iframe was identified as that stranger: PDF.js's examples page
 * came back as `jsfiddle.net`. The main document knows its own address, and
 * the evaluation runs in that document, so it is asked directly. The view and
 * then the requested URL remain as fallbacks, since a redirect the main
 * document did follow must still be honoured.
 */
function settledUrl(reported: unknown, viewUrl: string, requested: URL): URL {
  for (const candidate of [reported, viewUrl]) {
    if (typeof candidate !== "string" || candidate.length === 0) continue;
    try {
      return new URL(candidate);
    } catch {}
  }
  return new URL(requested.toString());
}

function linksFrom(value: unknown): readonly RenderedLink[] {
  if (!Array.isArray(value)) return [];
  const output: RenderedLink[] = [];
  for (const item of value) {
    if (!isLink(item) || typeof item.href !== "string") continue;
    try {
      output.push({
        url: new URL(item.href),
        text: typeof item.text === "string" ? item.text : "",
      });
    } catch {}
  }
  return output;
}

function isLink(value: unknown): value is LinkValue {
  return typeof value === "object" && value !== null;
}

async function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  await raceAbort(Bun.sleep(milliseconds), signal);
}

function raceAbort<Value>(promise: Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) return Promise.reject(new Error("navigation_cancelled"));
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error("navigation_cancelled"));
    signal.addEventListener("abort", cancel, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}
