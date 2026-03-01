import { ZenTaoApiError } from "../domain/errors.js";
import { mapStoryDetail, mapStoryList } from "../domain/mappers.js";
import { errResult, okResult } from "../infra/result.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import { postProcessList } from "./listPostProcess.js";
import {
  asRecord,
  authInputSchemaProperties,
  readEnum,
  readPagination,
  readPositiveInt,
  readSortOrder,
  readString,
} from "./common.js";

export function createStoryTools(context: ToolContext): ToolDefinition[] {
  return [createListStoriesTool(context), createGetStoryTool(context)];
}

function createListStoriesTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_stories",
    description: "查询需求列表（scope=product|project，支持分页、过滤、排序）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        scope: { type: "string", enum: ["product", "project"] },
        scopeId: { type: "integer", minimum: 1 },
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        status: { type: "string" },
        assignedTo: { type: "string" },
        keyword: { type: "string" },
        sortBy: { type: "string", enum: ["id", "title", "status", "stage", "priority", "assignedTo"] },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      required: ["scope", "scopeId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `stories_${Date.now()}`;
      const args = asRecord(rawArgs);
      const { page, limit } = readPagination(
        args,
        context.config.defaultPage,
        context.config.defaultLimit,
        context.config.maxLimit,
      );

      try {
        const apiClient = context.getApiClientForArgs(args);
        const scope = readEnum(args, "scope", ["product", "project"] as const);
        if (!scope) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 scope 不能为空");
        const scopeId = readPositiveInt(args, "scopeId", true);
        const payload = await apiClient.listStories(scope, scopeId, {
          page,
          limit,
          status: readString(args, "status"),
          assignedTo: readString(args, "assignedTo"),
          keyword: readString(args, "keyword"),
        });
        const mapped = mapStoryList(payload);
        const filteredItems = postProcessList({
          items: mapped.items,
          keyword: readString(args, "keyword"),
          keywordSelector: (item) => [item.title],
          equalsFilters: [
            { value: readString(args, "status"), selector: (item) => item.status },
            { value: readString(args, "assignedTo"), selector: (item) => item.assignedTo },
          ],
          sortBy: readString(args, "sortBy"),
          sortOrder: readSortOrder(args) ?? "asc",
          sortSelectors: {
            id: (item) => item.id,
            title: (item) => item.title,
            status: (item) => item.status,
            stage: (item) => item.stage,
            priority: (item) => item.priority,
            assignedTo: (item) => item.assignedTo,
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
        return errResult("UPSTREAM_ERROR", "查询需求列表失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createGetStoryTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_get_story",
    description: "按需求 ID 获取需求详情",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        storyId: { type: "integer", minimum: 1 },
      },
      required: ["storyId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `story_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const storyId = readPositiveInt(args, "storyId", true);
        const payload = await apiClient.getStory(storyId);
        return okResult(mapStoryDetail(payload), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询需求详情失败", requestId, { reason: String(error) });
      }
    },
  };
}
