# Bun-only project code with the official MCP SDK

The project uses Bun and Web-standard interfaces for source, commands, process control, files, SQLite, tests, and packaging, while retaining the official TypeScript MCP SDK for protocol correctness. The SDK may internally load Bun's `node:` compatibility implementation; this does not authorize direct Node imports or Node tooling in project code. Reimplementing MCP was rejected because the user's “no Node” constraint concerns the project's source/runtime choices, not dependency internals running under Bun.

