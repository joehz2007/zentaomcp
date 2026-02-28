import { ZenTaoApiError } from "../domain/errors.js";
import { mapExecutionList } from "../domain/mappers.js";
import { errResult, okResult } from "../infra/result.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import { postProcessList } from "./listPostProcess.js";
import {
  asRecord,
  authInputSchemaProperties,
  readPagination,
  readPositiveInt,
  readSortOrder,
  readString,
} from "./common.js";

export function createExecutionTools(context: ToolContext): ToolDefinition[] {
  return [createListExecutionsTool(context)];
}

function createListExecutionsTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_executions",
    description: "按项目查询执行列表（用于 tasks scope=execution）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        projectId: { type: "integer", minimum: 1 },
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        status: { type: "string" },
        keyword: { type: "string" },
        sortBy: { type: "string", enum: ["id", "name", "status", "startDate", "endDate", "projectId", "owner"] },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `executions_${Date.now()}`;
      const args = asRecord(rawArgs);
      const { page, limit } = readPagination(
        args,
        context.config.defaultPage,
        context.config.defaultLimit,
        context.config.maxLimit,
      );
      try {
        const apiClient = context.getApiClientForArgs(args);
        const projectId = readPositiveInt(args, "projectId", true);
        const payload = await apiClient.listExecutions(projectId, {
          page,
          limit,
          status: readString(args, "status"),
          keyword: readString(args, "keyword"),
        });
        const mapped = mapExecutionList(payload);
        const filteredItems = postProcessList({
          items: mapped.items,
          keyword: readString(args, "keyword"),
          keywordSelector: (item) => [item.name, item.owner],
          equalsFilters: [{ value: readString(args, "status"), selector: (item) => item.status }],
          sortBy: readString(args, "sortBy"),
          sortOrder: readSortOrder(args) ?? "asc",
          sortSelectors: {
            id: (item) => item.id,
            name: (item) => item.name,
            status: (item) => item.status,
            startDate: (item) => item.startDate,
            endDate: (item) => item.endDate,
            projectId: (item) => item.projectId,
            owner: (item) => item.owner,
          },
        });
        const normalized = {
          ...mapped,
          items: filteredItems,
          filteredTotal: filteredItems.length,
        };
        return okResult(normalized, requestId, page, limit, mapped.total ?? filteredItems.length);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询执行列表失败", requestId, { reason: String(error) });
      }
    },
  };
}
