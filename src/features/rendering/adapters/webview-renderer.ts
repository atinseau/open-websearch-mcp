import type {
  RenderedDocument,
  RenderedLink,
  RenderRequest,
  Renderer,
  WebViewRendererOptions,
} from "@/features/rendering";

type LinkValue = { readonly href?: unknown; readonly text?: unknown };
type TransferMonitor = {
  readonly bytes: () => number;
  readonly exceeded: () => boolean;
  readonly stop: () => void;
};

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
      (signal) => this.#renderTarget(request.url, signal),
    );
  }

  async #renderTarget(url: URL, signal: AbortSignal): Promise<RenderedDocument> {
    const view = new Bun.WebView({
      backend: { type: "chrome", url: this.#options.endpoint.cdpUrl.toString() },
      dataStore: "ephemeral",
    });
    const monitor = monitorTransfer(view, this.#options.configuration.maxDownloadBytes);
    const cancel = () => view.close();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await this.#navigate(view, url, signal, monitor.exceeded);
      const settledAt = Date.now();
      await pause(this.#options.configuration.settleTimeoutMs, signal);
      if (monitor.exceeded()) throw new Error("download_budget_exceeded");
      const document = await documentFrom(view, url, monitor.bytes(), settledAt);
      // WebView resolves redirects internally. Rejecting the resolved URL prevents any
      // redirected document from becoming evidence; production Obscura itself has no
      // private-network exemption, so a private redirect cannot be loaded either.
      assertPublic(this.#options.policy, document.url);
      return document;
    } finally {
      signal.removeEventListener("abort", cancel);
      monitor.stop();
      view.close();
    }
  }

  async #navigate(
    view: Bun.WebView,
    url: URL,
    signal: AbortSignal,
    exceeded: () => boolean,
  ): Promise<void> {
    await view.navigate("about:blank");
    assertPublic(this.#options.policy, url);
    await view.cdp("Network.enable");
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

function monitorTransfer(view: Bun.WebView, maximumBytes: number): TransferMonitor {
  let transferBytes = 0;
  let overBudget = false;
  const dataRequests = new Set<string>();
  const observe = (bytes: unknown): void => {
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) return;
    transferBytes += bytes;
    if (transferBytes > maximumBytes) {
      overBudget = true;
      view.close();
    }
  };
  const data = (event: Event) => {
    const payload = messageData(event);
    if (!isRecord(payload)) return;
    const requestId = payload.requestId;
    if (typeof requestId === "string") dataRequests.add(requestId);
    observe(payload.encodedDataLength);
  };
  const finished = (event: Event) => {
    const payload = messageData(event);
    if (!isRecord(payload)) return;
    if (typeof payload.requestId === "string" && dataRequests.has(payload.requestId)) return;
    observe(payload.encodedDataLength);
  };
  const response = (event: Event) => {
    const payload = messageData(event);
    const headers =
      isRecord(payload) && isRecord(payload.response) && isRecord(payload.response.headers)
        ? payload.response.headers
        : {};
    const length = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === "content-length",
    )?.[1];
    if (typeof length === "string" && Number(length) > maximumBytes) {
      overBudget = true;
      view.close();
    }
  };
  view.addEventListener("Network.dataReceived", data);
  view.addEventListener("Network.loadingFinished", finished);
  view.addEventListener("Network.responseReceived", response);
  return {
    bytes: () => transferBytes,
    exceeded: () => overBudget,
    stop: () => {
      view.removeEventListener("Network.dataReceived", data);
      view.removeEventListener("Network.loadingFinished", finished);
      view.removeEventListener("Network.responseReceived", response);
    },
  };
}

function messageData(event: Event): unknown {
  return event instanceof MessageEvent ? event.data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function documentFrom(
  view: Bun.WebView,
  url: URL,
  transferBytes: number,
  settledAt: number,
): Promise<RenderedDocument> {
  const content = await view.evaluate<{ text?: unknown; links?: unknown }>(
    "({ text: document.body?.innerText ?? '', links: Array.from(document.links, link => ({ href: link.href, text: link.innerText || link.textContent || '' })) })",
  );
  const text = typeof content.text === "string" ? content.text : "";
  return {
    url: new URL(view.url || url.toString()),
    text,
    markdown: text,
    links: links(content.links),
    diagnostics: { title: view.title, transferBytes, settledMs: Date.now() - settledAt },
  };
}

function links(value: unknown): readonly RenderedLink[] {
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
