import { expect, test } from "bun:test";

import { assertSanitized } from "./audit-artifacts.ts";
import { sanitizeJsonl } from "./contract.ts";
import { hasStandaloneCredential } from "./contract-json.ts";

/**
 * Credential-shaped fixtures are assembled at runtime rather than written as
 * literals. They are synthetic and match no real account, but committing them
 * verbatim trips GitHub push protection and secret scanners. Assembling them
 * keeps the sanitizer under exactly the same test pressure without shipping a
 * string that reads as a live token.
 */
const alphabet = "abcdefghijklmnopqrstuvwxyz";
const digits = "0123456789";
const slackBotToken = `${["x", "ox", "b"].join("")}-1234567890-${alphabet.slice(0, 16)}`;
const slackAppToken = `${["x", "app"].join("")}-1-A0123456789-1234567890123-${alphabet}`;
const gitlabPersonalToken = `${["gl", "pat"].join("")}-${alphabet.slice(0, 20)}`;
const gitlabDeployToken = `${["gl", "dt"].join("")}-${alphabet}${digits.slice(0, 6)}`;
const npmToken = `${["npm", ""].join("_")}${alphabet}${digits}`;
const googleApiKey = `${["AIza", "SyA"].join("")}${digits.repeat(3)}${digits.slice(0, 3)}`;
const anthropicKey = `${["sk", "ant", "api03"].join("-")}-${alphabet}${digits}`;
const openAiProjectKey = `${["sk", "proj"].join("-")}-${alphabet}${digits}`;
const openAiKey = `${["sk", ""].join("-")}${alphabet}${digits}`;
const githubPatToken = `${["github", "pat", ""].join("_")}${alphabet}${digits}`;
const jsonWebToken = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  `signature${digits}`,
].join(".");

const credentialFixtures = [
  anthropicKey,
  githubPatToken,
  openAiProjectKey,
  openAiKey,
  jsonWebToken,
  googleApiKey,
  gitlabPersonalToken,
  gitlabDeployToken,
  npmToken,
  slackBotToken,
  slackAppToken,
] as const;

test("sanitizes identity and machine data without removing research evidence", () => {
  const sanitized = sanitizeJsonl(sanitizationFixture(), ["/Users/example/private/case"]);
  expectRedactedSecrets(sanitized);
  expectPreservedEvidence(sanitized);
});

function sanitizationFixture(): string {
  return [
    JSON.stringify({
      session_id: "123e4567-e89b-42d3-a456-426614174000",
      sessionId: "camel-session-value",
      "account-id": "hyphen-account-value",
      token: "secret-value",
      tokens: ["plural-token-secret"],
      oauth_tokens: ["oauth-token-secret"],
      bearer_tokens: ["bearer-token-secret"],
      input_tokens: 42,
      session_ids: ["plural-session-secret"],
      account_ids: ["plural-account-secret"],
      password: "password-value",
      clientSecret: "client-secret-value",
      accessToken: "access-token-value",
      command:
        "OPENAI_API_KEY=env-value AWS_SECRET_ACCESS_KEY=aws-value AUTH_TOKEN=auth-token-value AWS_SESSION_TOKEN=session-token-value tool --password flag-value --access-token token-value session_id=embedded-session-secret token=bare-token-secret",
      callback:
        "https://user:pass@example.com/callback?client_secret=query-value&token=query-token-secret",
      oauthCallback: "https://localhost/callback?code=abc",
      researchCodeUrl: "https://example.com/search?code=examples",
      header: "Authorization: Bearer bearer-value",
      cookies: "Cookie: session=header-secret; Set-Cookie: auth=response-secret",
      "set-cookie": "structured-cookie-secret",
      "proxy-authorization": "structured-proxy-secret",
      credentials: { method: "oauth", value: "structured-credentials-secret" },
      auth: "structured-auth-secret",
      authentication: { method: "oauth", accessToken: "nested-auth-secret" },
      cwd: "/Users/example/private/case",
      binary: "/opt/homebrew/bin/codex",
      fileUrl: "file:///Users/example/private/auth.json",
      application: "/Applications/Claude.app/Contents/MacOS/Claude",
      projectPath: "/project/src/main.rs",
      systemPath: "/usr/local/bin/tool",
      unixPath: "/etc/passwd",
      awsKey: "AKIAIOSFODNN7EXAMPLE",
      pem: "-----BEGIN PRIVATE KEY-----\nprivate-key-material\n-----END PRIVATE KEY-----",
      unstructured: `Basic dTpw ${credentialFixtures.join(" ")}`,
      "/Users/example/private/key": "sensitive-key-value",
      documentation:
        'MCP-Session-Id: 1868a90c; file:///project/src/main.rs; /usr/bin/google-chrome; /usr/..; \\"/usr/..\\"; product-token = identifier',
      query: "Bun stable release",
      url: "https://bun.com/blog/bun-v1.3.14",
      answer: "Bun v1.3.14 is stable.",
      account: "research-account-fact",
      evidence_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      uuid: "research-uuid",
      providerThinking: {
        type: "thinking",
        thinking: "provider reasoning",
        signature: "opaque-provider-signature",
      },
      researchMetadata: {
        uuid: "RFC-uuid-example",
        signature: "Ed25519 specification signature",
        "product-token": "ExampleBot",
      },
    }),
  ].join("\n");
}

function expectRedactedSecrets(sanitized: string): void {
  for (const secret of [
    "secret-value",
    "plural-token-secret",
    "oauth-token-secret",
    "bearer-token-secret",
    "plural-session-secret",
    "plural-account-secret",
    "password-value",
    "client-secret-value",
    "access-token-value",
    "flag-value",
    "token-value",
    "user:pass@",
    "query-value",
    "bearer-value",
    "header-secret",
    "response-secret",
    "structured-cookie-secret",
    "structured-proxy-secret",
    "structured-credentials-secret",
    "structured-auth-secret",
    "nested-auth-secret",
    "123e4567-e89b-42d3-a456-426614174000",
    "camel-session-value",
    "hyphen-account-value",
    "env-value",
    "aws-value",
    "auth-token-value",
    "session-token-value",
    "embedded-session-secret",
    "bare-token-secret",
    "query-token-secret",
    "?code=abc",
    "dTpw",
    "/Users/example/private/case",
    "/opt/homebrew/bin/codex",
    "file:///Users/example/private/auth.json",
    "/Applications/Claude.app/Contents/MacOS/Claude",
    "/project/src/main.rs",
    "/usr/local/bin/tool",
    "/etc/passwd",
    "AKIAIOSFODNN7EXAMPLE",
    "private-key-material",
    ...credentialFixtures,
    "/Users/example/private/key",
    "sensitive-key-value",
    "research-uuid",
    "opaque-provider-signature",
  ]) {
    expect(sanitized).not.toContain(secret);
  }
}

function expectPreservedEvidence(sanitized: string): void {
  expect(sanitized).toContain("Bun stable release");
  expect(sanitized).toContain("https://bun.com/blog/bun-v1.3.14");
  expect(sanitized).toContain("Bun v1.3.14 is stable.");
  expect(JSON.parse(sanitized).documentation).toBe(
    'MCP-Session-Id: 1868a90c; [REDACTED_PATH]; [REDACTED_PATH]; /usr/..; \\"/usr/..\\"; product-token = identifier',
  );
  expect(sanitized).toContain("research-account-fact");
  expect(sanitized).toContain('"input_tokens":42');
  expect(sanitized).toContain("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
  expect(sanitized).toContain("RFC-uuid-example");
  expect(sanitized).toContain("Ed25519 specification signature");
  expect(sanitized).toContain("ExampleBot");
  expect(sanitized).toContain("https://example.com/search?code=examples");
  expect(sanitized).toContain('"method":"oauth"');
  expect(sanitized).toContain('"value":"[REDACTED]"');
}

test("rejects standalone Slack app and GitLab deploy tokens during audit", () => {
  expect(
    hasStandaloneCredential("xapp-1-A0123456789-1234567890123-abcdefghijklmnopqrstuvwxyz"),
  ).toBe(true);
  expect(hasStandaloneCredential("gldt-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
  expect(hasStandaloneCredential("MCP documentation and research evidence")).toBe(false);
  expect(() =>
    assertSanitized("xapp-1-A0123456789-1234567890123-abcdefghijklmnopqrstuvwxyz", "artifact"),
  ).toThrow("artifact contains unsanitized data");
  expect(() => assertSanitized("gldt-abcdefghijklmnopqrstuvwxyz123456", "artifact")).toThrow(
    "artifact contains unsanitized data",
  );
});
