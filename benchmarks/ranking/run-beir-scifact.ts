import { evaluateSciFact } from "./beir-scifact";

const report = await evaluateSciFact();
const output = Bun.env.BENCHMARK_REPORT ?? "benchmarks/reports/TEST-018/beir-scifact.json";
await Bun.$`mkdir -p ${output.slice(0, output.lastIndexOf("/"))}`;
await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
