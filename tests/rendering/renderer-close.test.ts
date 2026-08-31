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

const immediateScheduler: NavigationScheduler = {
  schedule: (request, operation) => operation(request.signal),
  shutdown: async () => {},
};

function fakeView(behaviour: { closeThrows: boolean; navigateThrows?: string }) {
  let closeAttempts = 0;
  const handle: RenderView = Object.assign(new EventTarget(), {
    url: "https://example.test/page",
    title: "Fake page",
    navigate: async () => {
      if (behaviour.navigateThrows) throw new Error(behaviour.navigateThrows);
    },
    cdp: async () => undefined,
    evaluate: async () => ({ text: "Rendered body text.", links: [] }),
    close: () => {
      closeAttempts += 1;
      if (behaviour.closeThrows) throw new Error("WebView closed");
    },
  });
  return { handle, closeAttempts: () => closeAttempts };
}
