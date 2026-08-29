import { resolveAliasProof } from "@/consumer.ts";

if (resolveAliasProof() !== "resolved-by-bun-ts7-oxlint-and-test") {
  throw new Error("Bun runtime did not resolve the alias to the expected module");
}

console.log(JSON.stringify({ runtime: "bun", alias: "@/consumer.ts", result: "passed" }));
