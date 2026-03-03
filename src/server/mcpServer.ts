import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "../infra/config.js";
import { logger } from "../infra/logger.js";
import { ToolRegistry } from "./toolRegistry.js";
import { ZenTaoApiClient } from "../zentao/apiClient.js";
import { ZenTaoAuthClient } from "../zentao/authClient.js";
import { executeCallTool, listToolsResult } from "./toolRuntime.js";
import { createApiClientResolver } from "./authOverride.js";

export function createMcpServer(): { start: () => Promise<void> } {
  const config = loadConfig();
  const authClient = new ZenTaoAuthClient({
    baseUrl: config.zentaoBaseUrl,
    account: config.zentaoAccount,
    password: config.zentaoPassword,
    timeoutMs: config.zentaoTimeoutMs,
    tokenTtlMs: config.zentaoTokenTtlMs,
  });
  const apiClient = new ZenTaoApiClient(config.zentaoBaseUrl, config.zentaoTimeoutMs, authClient);
  const getApiClientForArgs = createApiClientResolver(apiClient, config);
  const registry = new ToolRegistry({ apiClient, getApiClientForArgs, config });

  const server = new Server(
    { name: "zentao-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => listToolsResult(registry));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return executeCallTool(registry, name, args);
  });

  return {
    start: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info("zentao_mcp_server_started", {
        version: "0.1.0",
        hasBaseUrl: Boolean(config.zentaoBaseUrl),
        enableWriteTools: config.enableWriteTools,
      });
    },
  };
}
