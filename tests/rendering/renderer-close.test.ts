import { expect, test } from "bun:test";

import {
  createWebViewRenderer,
  type NavigationScheduler,
  type RenderView,
} from "@/features/rendering";

/**
 * Closing the view is cleanup, not part of the result. Chrome answers a close
 * on a target it already dropped with "WebView closed", and that rejection used
 * to replace the document the navigation had already produced. A page that had
 * been rendered and returned then reached the caller as a failure, which is why
 * the same query alternated between finding a source and missing it.
 */
test("RENDER a failing close never replaces the document that was rendered", async () => {
  const view = fakeView({ closeThrows: true });
  const renderer = createWebViewRenderer({
    endpoint: { cdpUrl: new URL("ws://127.0.0.1:9222") },
    configuration: { navigationTimeoutMs: 2_000, settleTimeoutMs: 1, maxDownloadBytes: 1024 },
    scheduler: immediateScheduler,
    policy: { assess: () => ({ allowed: true }) },
    openView: () => view.handle,
  });

  const document = await renderer.render({
    url: new URL("https://example.test/page"),
    signal: new AbortController().signal,
    investigationId: "close-failure",
    kind: "destination",
    explicitOpen: true,
  });

  expect(document.text).toContain("Rendered body text");
  expect(view.closeAttempts()).toBe(1);
});

test("RENDER a failing close does not mask the navigation's own error", async () => {
  const view = fakeView({ closeThrows: true, navigateThrows: "origin_unreachable" });
  const renderer = createWebViewRenderer({
    endpoint: { cdpUrl: new URL("ws://127.0.0.1:9222") },
    configuration: { navigationTimeoutMs: 2_000, settleTimeoutMs: 1, maxDownloadBytes: 1024 },
    scheduler: immediateScheduler,
    policy: { assess: () => ({ allowed: true }) },
    openView: () => view.handle,
  });

  const failure = await renderer
    .render({
      url: new URL("https://example.test/page"),
      signal: new AbortController().signal,
      investigationId: "close-failure",
      kind: "destination",
      explicitOpen: true,
    })
    .then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : "unknown"),
    );

  expect(failure).toBe("origin_unreachable");
});

/**
 * A page that embeds a third-party iframe must still be the page that was
 * asked for. `view.url` reports whatever frame settled last, so PDF.js's
 * examples page - which embeds a jsfiddle - came back identified as
 * `jsfiddle.net`. The document was right and its identity was wrong, so a
 * caller looking for the page it requested could not find it, and stored
 * evidence was filed under a stranger's URL.
 */
test("RENDER a page that embeds a frame keeps its own identity", async () => {
  const view = fakeView({
    closeThrows: false,
    // The view reports the frame that settled last; the document reports itself.
    url: "https://jsfiddle.net/embedded/",
    mainDocumentUrl: "https://mozilla.github.io/pdf.js/examples/",
  });
  const renderer = createWebViewRenderer({
    endpoint: { cdpUrl: new URL("ws://127.0.0.1:9222") },
    configuration: { navigationTimeoutMs: 2_000, settleTimeoutMs: 1, maxDownloadBytes: 1024 },
    scheduler: immediateScheduler,
    policy: { assess: () => ({ allowed: true }) },
    openView: () => view.handle,
  });

  const document = await renderer.render({
    url: new URL("https://mozilla.github.io/pdf.js/examples/"),
    signal: new AbortController().signal,
    investigationId: "framed",
    kind: "destination",
    explicitOpen: true,
  });

  expect(document.url.toString()).toBe("https://mozilla.github.io/pdf.js/examples/");
});

const immediateScheduler: NavigationScheduler = {
  schedule: (request, operation) => operation(request.signal),
  shutdown: async () => {},
};

function fakeView(behaviour: {
  closeThrows: boolean;
  navigateThrows?: string;
  url?: string;
  mainDocumentUrl?: string;
}) {
  let closeAttempts = 0;
  const handle: RenderView = Object.assign(new EventTarget(), {
    url: behaviour.url ?? "https://example.test/page",
    title: "Fake page",
    navigate: async () => {
      if (behaviour.navigateThrows) throw new Error(behaviour.navigateThrows);
    },
    cdp: async () => undefined,
    // The main document reports its own address; a framed page's view URL is
    // the frame's, which is exactly the confusion under test.
    evaluate: async () => ({
      text: "Rendered body text.",
      location: behaviour.mainDocumentUrl,
      links: [],
    }),
    close: () => {
      closeAttempts += 1;
      if (behaviour.closeThrows) throw new Error("WebView closed");
    },
  });
  return { handle, closeAttempts: () => closeAttempts };
}
