import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const packageName = "open-websearch-mcp";
const packageVersion = "0.1.1";
const repository = `${import.meta.dir}/../..`;

async function assertPackedArchive(tarball: string): Promise<void> {
  const inspected = await run(["tar", "-tzf", tarball]);
  expect(inspected.exitCode).toBe(0);
  expect(inspected.output).toContain(`package/bin/${packageName}.ts`);
  expect(inspected.output).toContain("package/src/cli.ts");
  for (const excluded of ["tests/", "benchmarks/", "spikes/", "docs/orchestration/"]) {
    expect(inspected.output).not.toContain(`package/${excluded}`);
  }
}

async function installPackedArtifact(tarball: string, temporary: string): Promise<string> {
  const installed = await run(["bun", "install", "--ignore-scripts", tarball], temporary);
  if (installed.exitCode !== 0)
    throw new Error(`packed_artifact_install_failed:${installed.output}`);
  expect(
    await Bun.file(`${temporary}/node_modules/${packageName}/package.json`).json(),
  ).toMatchObject({
    name: packageName,
    version: packageVersion,
  });
  return installed.output;
}

function createTransport(
  tarball: string,
  temporary: string,
  appendDiagnostic: (value: string) => void,
) {
  const transport = new StdioClientTransport({
    command: Bun.which("bunx") ?? "bunx",
    args: ["--bun", "--package", `file:${tarball}`, packageName],
    cwd: temporary,
    stderr: "pipe",
    env: { ...Bun.env, OPEN_WEBSEARCH_MCP_RELEASE_FIXTURE: "1" },
  });
  transport.stderr?.on("data", (chunk) => appendDiagnostic(chunk.toString()));
  transport.onerror = (error) => appendDiagnostic(`transport_error:${error.message}\n`);
  transport.onclose = () => appendDiagnostic("transport_closed\n");
  return transport;
}

test("REL-002: packed artifact runs through bunx and completes the MCP contract", async () => {
  const temporary = `/private/tmp/open-websearch-package-${crypto.randomUUID()}`;
  const tarball = `${repository}/${packageName}-${packageVersion}.tgz`;
  await Bun.write(`${temporary}/package.json`, "{}\n");
  try {
    const packed = await run(["bun", "pm", "pack", "--ignore-scripts"], repository);
    expect(packed.exitCode).toBe(0);
    expect(await Bun.file(tarball).exists()).toBeTrue();

    await assertPackedArchive(tarball);
    const installedOutput = await installPackedArtifact(tarball, temporary);

    const client = new Client(
      { name: "packed-artifact-smoke", version: packageVersion },
      { supportedProtocolVersions: ["2025-06-18", "2024-11-05"] },
    );
    let diagnostics = "";
    const transport = createTransport(tarball, temporary, (value) => {
      diagnostics += value;
    });
    try {
      await client.connect(transport);
    } catch (error) {
      throw new Error(
        `packed_artifact_connection_failed:install=${installedOutput}${diagnostics}`,
        {
          cause: error,
        },
      );
    }
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(["web_open", "web_search"]);
    const result = await client.callTool({
      name: "web_search",
      arguments: { query: "release fixture" },
    });
    expect(result.structuredContent).toMatchObject({
      investigation_id: "release-fixture",
      status: "success",
    });
    console.log(
      'packed-artifact-smoke {"initialize":"ok","tools":["web_open","web_search"],"fixture":"release-fixture"}',
    );
    await client.close();
  } finally {
    await run(["rm", "-f", tarball]);
    await run(["rm", "-rf", temporary]);
  }
}, 30_000);

async function run(command: string[], cwd?: string): Promise<{ exitCode: number; output: string }> {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [output, error, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, output: `${output}${error}` };
}
