import { ZenTaoApiError } from "../domain/errors.js";
import { errResult, okResult } from "../infra/result.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import { asRecord, authInputSchemaProperties } from "./common.js";

export function createHealthCheckTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_health_check",
    description: "检查禅道连通性、认证状态和基础配置",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        verifyAuth: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `health_${Date.now()}`;
      const args = asRecord(rawArgs);
      const verifyAuth = args.verifyAuth === undefined ? true : Boolean(args.verifyAuth);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const data = await apiClient.healthCheck(verifyAuth);
        return okResult(data, requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "健康检查执行失败", requestId, {
          reason: String(error),
        });
      }
    },
  };
}
