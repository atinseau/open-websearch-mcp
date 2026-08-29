import { expect, test } from "bun:test";

import {
  assessPublicUrl,
  createRobotsPolicy,
  createPublicNetworkClient,
  redactDiagnostic,
  safeArchiveEntry,
  sanitizeExternalHtml,
  sanitizeOutboundUrl,
  type DnsResolver,
} from "@/features/security";

const encoder = new TextEncoder();
const publicAddress = "93.184.216.34";

function resolver(...answers: string[][]): DnsResolver {
  let call = 0;
  return { resolve: async () => answers[Math.min(call++, answers.length - 1)] ?? [] };
}

function stream(value: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start: (controller) => {
      controller.enqueue(value);
      controller.close();
    },
  });
}

function response(
  status = 200,
  headers = new Headers(),
  body = encoder.encode("safe"),
): Promise<ResponseLike> {
  return Promise.resolve({ status, headers, body: stream(body) });
}

interface ResponseLike {
  readonly status: number;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array>;
}

async function rejects(pending: Promise<unknown>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await pending;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) expect(failure.message).toContain(message);
}

test("SECURITY-003/004 reject hostile schemes, credentials, host forms, and IPv4 ranges", () => {
  for (const value of [
    "file:///etc/passwd",
    "ftp://example.com",
    "http://user:pass@example.com",
    "http://localhost",
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254",
    "http://224.0.0.1",
    "http://0.0.0.0",
    "http://metadata.google.internal",
    "http://2130706433",
    "http://0177.0.0.1",
  ])
    expect(assessPublicUrl(new URL(value)).allowed).toBeFalse();
  expect(assessPublicUrl(new URL("https://example.com:443/path")).allowed).toBeTrue();
});

test("SECURITY-004 rejects IPv6 local, mapped IPv4, multicast, and unspecified addresses", () => {
  for (const value of [
    "[::]",
    "[::1]",
    "[fe80::1]",
    "[fc00::1]",
    "[ff02::1]",
    "[::ffff:127.0.0.1]",
  ])
    expect(assessPublicUrl(new URL(`http://${value}`)).allowed).toBeFalse();
});

test("SECURITY-004 validates DNS twice and refuses rebinding before a connection", async () => {
  let connected = false;
  const client = createPublicNetworkClient({
    resolver: resolver([publicAddress], ["127.0.0.1"]),
    transport: {
      fetch: async () => {
        connected = true;
        return response();
      },
    },
  });
  await rejects(
    client.fetch(new URL("https://public.example/a"), "explicit_open"),
    "non_public_dns_answer",
  );
  expect(connected).toBeFalse();
});

test("SECURITY-004 rejects redirect pivots to private destinations and caps redirect loops", async () => {
  const pivot = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    transport: {
      fetch: async () => response(302, new Headers({ location: "http://127.0.0.1/admin" })),
    },
  });
  await rejects(
    pivot.fetch(new URL("https://public.example"), "explicit_open"),
    "non_public_address",
  );
  const loop = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    maximumRedirects: 1,
    transport: { fetch: async () => response(302, new Headers({ location: "/again" })) },
  });
  await rejects(loop.fetch(new URL("https://public.example"), "explicit_open"), "redirect_limit");
});

test("SECURITY-004 bounds raw response bytes and decompression expansion", async () => {
  const oversized = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    maximumBytes: 3,
    transport: { fetch: async () => response(200, new Headers(), encoder.encode("four")) },
  });
  await rejects(
    oversized.fetch(new URL("https://public.example"), "explicit_open"),
    "response_size_limit",
  );
  const compressed = new Uint8Array(
    await new Response(
      new Blob([encoder.encode("x".repeat(100))])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const bomb = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    maximumDecompressedBytes: 5,
    transport: {
      fetch: async () => response(200, new Headers({ "content-encoding": "gzip" }), compressed),
    },
  });
  await rejects(
    bomb.fetch(new URL("https://public.example"), "explicit_open"),
    "response_size_limit",
  );
});

test("SECURITY-005 applies robots to automatic search and records explicit-open override", async () => {
  const client = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    robots: { canCrawl: async () => false },
    transport: { fetch: async () => response() },
  });
  await rejects(
    client.fetch(new URL("https://public.example"), "automatic_search"),
    "robots_disallowed",
  );
  expect(
    (await client.fetch(new URL("https://public.example"), "explicit_open")).robotsIgnored,
  ).toBeTrue();
  let calls = 0;
  const redirected = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    robots: { canCrawl: async () => ++calls < 2 },
    transport: { fetch: async () => response(302, new Headers({ location: "/next" })) },
  });
  await rejects(
    redirected.fetch(new URL("https://public.example"), "automatic_search"),
    "robots_disallowed",
  );
  expect(calls).toBe(2);
});

test("SECURITY-005 production robots policy blocks a matching automatic destination", async () => {
  const policy = createRobotsPolicy({
    fetch: async () => new Response("User-agent: OpenWebSearchMCP\nDisallow: /private"),
  });
  expect(
    await policy.canCrawl(new URL("https://public.example/private/report"), "OpenWebSearchMCP"),
  ).toBeFalse();
  expect(
    await policy.canCrawl(new URL("https://public.example/public"), "OpenWebSearchMCP"),
  ).toBeTrue();
});

test("SECURITY-006 keeps provenance while removing trackers and fragments", async () => {
  const outgoing = sanitizeOutboundUrl(
    new URL("https://public.example/a?id=7&utm_source=x&gclid=y#frag"),
  );
  expect(outgoing.href).toBe("https://public.example/a?id=7");
  const client = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    transport: { fetch: async () => response(302, new Headers({ location: "/b?fbclid=x" })) },
  });
  await rejects(
    client.fetch(new URL("https://public.example/a"), "explicit_open"),
    "redirect_limit",
  );
});

test("SECURITY-001/002 strips active and hidden markup, preserving only untrusted evidence", async () => {
  const hostile =
    '<p>Read</p><script>mcp.web_open("x")</script><style>p{}</style><div hidden>secret</div><a href="javascript:alert(1)" onclick="go()">link</a><pre>const x = 1</pre><svg><script>x</script></svg>';
  const evidence = sanitizeExternalHtml(hostile);
  expect(evidence).toContain("Read");
  expect(evidence).toContain("const x = 1");
  expect(evidence).not.toContain("mcp.web_open");
  expect(evidence).not.toContain("secret");
  expect(evidence).not.toContain("javascript:");
  const client = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    transport: { fetch: async () => response() },
  });
  expect((await client.fetch(new URL("https://public.example"), "explicit_open")).trust).toBe(
    "external_untrusted",
  );
});

test("SECURITY-008/009/010 retain no secrets and reject archive traversal without cookie authority", () => {
  expect(redactDiagnostic("set-cookie: sid=abc\nBearer top-secret password=hunter2")).not.toContain(
    "top-secret",
  );
  expect(redactDiagnostic("set-cookie: sid=abc")).not.toContain("sid=abc");
  expect(safeArchiveEntry("bin/obscura")).toBeTrue();
  for (const entry of ["../escape", "a/../../escape", "/absolute", "\\windows"])
    expect(safeArchiveEntry(entry)).toBeFalse();
});

test("PROD-006 navigation authority never treats extracted links as requests", async () => {
  const seen: string[] = [];
  const client = createPublicNetworkClient({
    resolver: resolver([publicAddress]),
    transport: {
      fetch: async ({ url }) => {
        seen.push(url.href);
        return response();
      },
    },
  });
  await client.fetch(new URL("https://public.example/explicit"), "explicit_open");
  expect(seen).toEqual(["https://public.example/explicit"]);
});
