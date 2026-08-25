type ReviewEvidence = {
  role: "challenger" | "spec-reviewer" | "quality-reviewer" | "verifier";
  verdict: "accept";
  agent: string;
  model: string;
  provider: string;
  session_id: string;
  export_path: string;
  export_sha256: string;
};

const argumentsByName = new Map<string, string>();
for (let index = 0; index < Bun.argv.length - 1; index += 1) {
  const value = Bun.argv[index];
  if (value?.startsWith("--")) argumentsByName.set(value, Bun.argv[index + 1]!);
}

const repository = argumentsByName.get("--repo") ?? process.cwd();
const base = argumentsByName.get("--base");
const head = argumentsByName.get("--head") ?? "HEAD";

if (!base || !/^[0-9a-f]{40}$/u.test(base) || !/^[0-9a-f]{40}$/u.test(head)) {
  throw new Error("Expected full --base and --head Git SHAs");
}

async function git(args: string[]): Promise<string> {
  const child = Bun.spawn(["git", "-C", repository, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
  return stdout.trim();
}

const allowedPaths = [
  ".opencode/",
  "docs/orchestration/coverage.toml",
  "docs/orchestration/model-roster.toml",
  "docs/orchestration/runs/BOOT-002/",
  "docs/orchestration/state.toml",
  "scripts/orchestration/",
];

const changedPaths = (await git(["diff", "--name-only", `${base}..${head}`]))
  .split("\n")
  .filter(Boolean);
const outsideWriteSet = changedPaths.filter(
  (path) => !allowedPaths.some((allowed) => path === allowed || path.startsWith(allowed)),
);
if (outsideWriteSet.length > 0) {
  throw new Error(`BOOT-002 changed paths outside its write set: ${outsideWriteSet.join(", ")}`);
}

const state = Bun.TOML.parse(await Bun.file(`${repository}/docs/orchestration/state.toml`).text());
if (state.schema_version !== 2 || typeof state.tasks !== "object") {
  throw new Error("Invalid orchestration state schema");
}

const requiredEvidence = new Map<string, ReviewEvidence["role"]>([
  ["challenge.json", "challenger"],
  ["spec-review.json", "spec-reviewer"],
  ["quality-review.json", "quality-reviewer"],
  ["verification.json", "verifier"],
]);
const reviews: ReviewEvidence[] = [];
for (const [filename, expectedRole] of requiredEvidence) {
  const path = `${repository}/docs/orchestration/runs/BOOT-002/${filename}`;
  const evidence = await Bun.file(path).json() as ReviewEvidence;
  if (
    evidence.role !== expectedRole ||
    evidence.verdict !== "accept" ||
    !evidence.agent ||
    !evidence.model ||
    !evidence.provider ||
    !evidence.session_id ||
    !/^[0-9a-f]{64}$/u.test(evidence.export_sha256) ||
    !/^docs\/orchestration\/runs\/BOOT-002\/exports\/[a-zA-Z0-9._-]+\.jsonl$/u.test(
      evidence.export_path,
    )
  ) {
    throw new Error(`Invalid BOOT-002 evidence: ${filename}`);
  }
  const exportFile = Bun.file(`${repository}/${evidence.export_path}`);
  if (!(await exportFile.exists())) throw new Error(`Missing export for ${filename}`);
  const actualHash = new Bun.CryptoHasher("sha256")
    .update(await exportFile.arrayBuffer())
    .digest("hex");
  if (actualHash !== evidence.export_sha256) throw new Error(`Export hash mismatch: ${filename}`);
  reviews.push(evidence);
}

const reviewIdentities = new Set(reviews.map(({ agent, session_id }) => `${agent}:${session_id}`));
if (reviewIdentities.size !== reviews.length) {
  throw new Error("BOOT-002 evidence roles must use independent agent sessions");
}

const requiredFiles = [
  "docs/orchestration/coverage.toml",
  "docs/orchestration/model-roster.toml",
  "docs/orchestration/runs/BOOT-002/implementation.json",
  "docs/orchestration/runs/BOOT-002/plan.json",
  "scripts/orchestration/audit.ts",
  "scripts/orchestration/main.ts",
];
for (const path of requiredFiles) {
  if (!(await Bun.file(`${repository}/${path}`).exists())) throw new Error(`Missing ${path}`);
}

console.log(JSON.stringify({ status: "accepted", task: "BOOT-002", changedPaths }));
