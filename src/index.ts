#!/usr/bin/env node
import "dotenv/config";
import { createMcpServer } from "./server/mcpServer.js";

async function main(): Promise<void> {
  const server = createMcpServer();
  await server.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[fatal] zentao-mcp failed to start:", error);
  process.exit(1);
});
