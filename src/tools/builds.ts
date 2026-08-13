import { ZenTaoApiError } from "../domain/errors.js";
import { mapBuildList } from "../domain/mappers.js";
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

export function createBuildTools(context: ToolContext): ToolDefinition[] {
  return [createListBuildsTool(context)];
}

function createListBuildsTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_builds",
    description: "按执行 ID 查询版本/构建列表（用于 resolve 时选择 resolvedBuild）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        executionId: { type: "integer", minimum: 1 },
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        keyword: { type: "string" },
        sortBy: {
          type: "string",
          enum: ["id", "name", "date", "builder", "productId", "projectId", "executionId"],
        },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      required: ["executionId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `builds_${Date.now()}`;
      const args = asRecord(rawArgs);
      const { page, limit } = readPagination(
        args,
        context.config.defaultPage,
        context.config.defaultLimit,
        context.config.maxLimit,
      );

      try {
        const apiClient = context.getApiClientForArgs(args);
        const executionId = readPositiveInt(args, "executionId", true);
        const payload = await apiClient.listBuilds(executionId, {
          page,
          limit,
          keyword: readString(args, "keyword"),
        });
        const mapped = mapBuildList(payload);
        const filteredItems = postProcessList({
          items: mapped.items,
          keyword: readString(args, "keyword"),
          keywordSelector: (item) => [item.name, item.builder, item.desc],
          equalsFilters: [],
          sortBy: readString(args, "sortBy"),
          sortOrder: readSortOrder(args) ?? "asc",
          sortSelectors: {
            id: (item) => item.id,
            name: (item) => item.name,
            date: (item) => item.date,
            builder: (item) => item.builder,
            productId: (item) => item.productId,
            projectId: (item) => item.projectId,
            executionId: (item) => item.executionId,
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
        return errResult("UPSTREAM_ERROR", "查询版本列表失败", requestId, { reason: String(error) });
      }
    },
  };
}
