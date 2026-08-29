import { expect, test } from "bun:test";

import { redactDiagnostic } from "@/features/security";

test("SECURITY-008 redacts credentials without mangling technical queries", () => {
  // Redaction must not cost observability. A name alone is prose; a name with a
  // credential-shaped value, or any assignment, is a secret.
  for (const readable of [
    "how does bearer token authentication work",
    "auth: how oauth works",
    "github auth flow",
    "oauth token refresh explained",
    "token: the definitive guide",
  ]) {
    expect(redactDiagnostic(readable)).toBe(readable);
  }
  for (const [carrier, value] of [
    ["api_key=REALSECRET", "REALSECRET"],
    ["api-key=PLAINTEXT", "PLAINTEXT"],
    ["Bearer eyJhbGciOiJIUzI1NiJ9", "eyJhbGciOiJIUzI1NiJ9"],
    ["password=hunter2", "hunter2"],
    ["token: abc123xyz", "abc123xyz"],
    ["secret=s3cr3t-value", "s3cr3t-value"],
    ["access_key: AKIA1234567890ABCD", "AKIA1234567890ABCD"],
  ] as const) {
    expect(redactDiagnostic(carrier)).not.toContain(value);
  }
});
