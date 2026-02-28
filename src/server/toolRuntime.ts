import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZenTaoApiError } from "../domain/errors.js";
import { errResult } from "../infra/result.js";
import { logger } from "../infra/logger.js";
import type { ToolRegistry } from "./toolRegistry.js";

export function listToolsResult(registry: ToolRegistry): { tools: Array<Record<string, unknown>> } {
  return {
    tools: registry.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
}

export async function executeCallTool(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            errResult("INVALID_ARGUMENT", `未知工具: ${name}`, `tool_${Date.now()}`),
            null,
            2,
          ),
        },
      ],
    };
  }

  logger.info("tool_call_started", { toolName: name });
  try {
    const result = await tool.handler(args);
    logger.info("tool_call_finished", { toolName: name, ok: result.ok });
    return {
      isError: !result.ok,
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const requestId = `tool_${Date.now()}`;
    const result =
      error instanceof ZenTaoApiError
        ? errResult(error.code, error.message, requestId, error.details)
        : errResult("UPSTREAM_ERROR", "工具执行失败", requestId, { reason: String(error) });
    logger.error("tool_call_failed", { toolName: name, reason: String(error) });
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
