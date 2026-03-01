import { ZenTaoApiError } from "../domain/errors.js";
import { mapProjectDetail, mapProjectList } from "../domain/mappers.js";
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

export function createProjectTools(context: ToolContext): ToolDefinition[] {
  return [createListProjectsTool(context), createGetProjectTool(context)];
}

function createListProjectsTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_projects",
    description: "查询项目列表（支持分页、过滤、排序）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        status: { type: "string" },
        keyword: { type: "string" },
        sortBy: { type: "string", enum: ["id", "name", "status", "startDate", "endDate", "owner"] },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `projects_${Date.now()}`;
      const args = asRecord(rawArgs);
      const { page, limit } = readPagination(
        args,
        context.config.defaultPage,
        context.config.defaultLimit,
        context.config.maxLimit,
      );

      try {
        const apiClient = context.getApiClientForArgs(args);
        const payload = await apiClient.listProjects({
          page,
          limit,
          status: readString(args, "status"),
          keyword: readString(args, "keyword"),
        });
        const mapped = mapProjectList(payload);
        const filteredItems = postProcessList({
          items: mapped.items,
          keyword: readString(args, "keyword"),
          keywordSelector: (item) => [item.name, item.owner],
          equalsFilters: [
            { value: readString(args, "status"), selector: (item) => item.status },
          ],
          sortBy: readString(args, "sortBy"),
          sortOrder: readSortOrder(args) ?? "asc",
          sortSelectors: {
            id: (item) => item.id,
            name: (item) => item.name,
            status: (item) => item.status,
            startDate: (item) => item.startDate,
            endDate: (item) => item.endDate,
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
        return errResult("UPSTREAM_ERROR", "查询项目列表失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createGetProjectTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_get_project",
    description: "按项目 ID 获取项目详情",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        projectId: { type: "integer", minimum: 1 },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `project_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const projectId = readPositiveInt(args, "projectId", true);
        const payload = await apiClient.getProject(projectId);
        return okResult(mapProjectDetail(payload), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询项目详情失败", requestId, { reason: String(error) });
      }
    },
  };
}
