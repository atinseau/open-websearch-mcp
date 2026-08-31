import type { RenderView } from "@/features/rendering";
import { cacheDirectives, headerValue } from "./webview-headers.ts";
import { closeQuietly } from "./webview-close.ts";

/**
 * What a navigation observed on the wire: how many bytes crossed it, whether
 * the download budget was blown, and what the origin declared about the main
 * document. It is a separate concern from turning a loaded page into a
 * document, so it lives apart from the renderer that consumes it.
 */
export type TransferMonitor = {
  readonly bytes: () => number;
  readonly exceeded: () => boolean;
  readonly contentType: () => string | undefined;
  readonly cacheHeaders: () => Record<string, string>;
  readonly notModified: () => boolean;
  readonly stop: () => void;
};

export function monitorTransfer(view: RenderView, maximumBytes: number): TransferMonitor {
  let transferBytes = 0;
  let overBudget = false;
  let documentType: string | undefined;
  let documentCacheHeaders: Record<string, string> = {};
  let documentNotModified = false;
  const dataRequests = new Set<string>();
  const observe = (bytes: unknown): void => {
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) return;
    transferBytes += bytes;
    if (transferBytes > maximumBytes) {
      overBudget = true;
      closeQuietly(view);
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
    const headers = responseHeaders(payload);
    documentType ??= declaredDocumentType(payload, headers);
    if (isDocumentResponse(payload) && Object.keys(documentCacheHeaders).length === 0)
      documentCacheHeaders = cacheDirectives(headers);
    if (isDocumentResponse(payload) && responseStatus(payload) === 304) documentNotModified = true;
    const length = headerValue(headers, "content-length");
    if (typeof length === "string" && Number(length) > maximumBytes) {
      overBudget = true;
      closeQuietly(view);
    }
  };
  view.addEventListener("Network.dataReceived", data);
  view.addEventListener("Network.loadingFinished", finished);
  view.addEventListener("Network.responseReceived", response);
  return {
    bytes: () => transferBytes,
    exceeded: () => overBudget,
    contentType: () => documentType,
    cacheHeaders: () => documentCacheHeaders,
    notModified: () => documentNotModified,
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

function responseHeaders(payload: unknown): Record<string, unknown> {
  return isRecord(payload) && isRecord(payload.response) && isRecord(payload.response.headers)
    ? payload.response.headers
    : {};
}

/**
 * Reads the content type the origin declared for the main document. Sub-resource
 * responses are ignored, so a page's own type is not shadowed by an image or
 * script it happens to load first.
 */
function declaredDocumentType(
  payload: unknown,
  headers: Record<string, unknown>,
): string | undefined {
  if (!isDocumentResponse(payload)) return undefined;
  const declared = headerValue(headers, "content-type");
  return typeof declared === "string" ? declared : undefined;
}

function isDocumentResponse(payload: unknown): boolean {
  return isRecord(payload) && payload.type === "Document";
}

function responseStatus(payload: unknown): number | undefined {
  if (!isRecord(payload) || !isRecord(payload.response)) return undefined;
  const status = payload.response.status;
  return typeof status === "number" ? status : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
