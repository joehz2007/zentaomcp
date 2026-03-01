import { ZenTaoApiError } from "../domain/errors.js";
import { mapBugDetail, mapBugList } from "../domain/mappers.js";
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

export function createBugTools(context: ToolContext): ToolDefinition[] {
  return [createListBugsTool(context), createGetBugTool(context)];
}

function createListBugsTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_bugs",
    description: "查询 Bug 列表（scope=product|project，支持分页、过滤、排序）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        scope: { type: "string", enum: ["product", "project"] },
        scopeId: { type: "integer", minimum: 1 },
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        status: { type: "string" },
        severity: { type: "string" },
        assignedTo: { type: "string" },
        keyword: { type: "string" },
        sortBy: {
          type: "string",
          enum: ["id", "title", "status", "severity", "priority", "assignedTo", "openedBy", "resolvedBy"],
        },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      required: ["scope", "scopeId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `bugs_${Date.now()}`;
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
        const payload = await apiClient.listBugs(scope, scopeId, {
          page,
          limit,
          status: readString(args, "status"),
          severity: readString(args, "severity"),
          assignedTo: readString(args, "assignedTo"),
          keyword: readString(args, "keyword"),
        });
        const mapped = mapBugList(payload);
        const filteredItems = postProcessList({
          items: mapped.items,
          keyword: readString(args, "keyword"),
          keywordSelector: (item) => [item.title],
          equalsFilters: [
            { value: readString(args, "status"), selector: (item) => item.status },
            { value: readString(args, "severity"), selector: (item) => item.severity },
            { value: readString(args, "assignedTo"), selector: (item) => item.assignedTo },
          ],
          sortBy: readString(args, "sortBy"),
          sortOrder: readSortOrder(args) ?? "asc",
          sortSelectors: {
            id: (item) => item.id,
            title: (item) => item.title,
            status: (item) => item.status,
            severity: (item) => item.severity,
            priority: (item) => item.priority,
            assignedTo: (item) => item.assignedTo,
            openedBy: (item) => item.openedBy,
            resolvedBy: (item) => item.resolvedBy,
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
        return errResult("UPSTREAM_ERROR", "查询 Bug 列表失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createGetBugTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_get_bug",
    description: "按 Bug ID 获取 Bug 详情",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        bugId: { type: "integer", minimum: 1 },
      },
      required: ["bugId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `bug_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const bugId = readPositiveInt(args, "bugId", true);
        const payload = await apiClient.getBug(bugId);
        return okResult(mapBugDetail(payload), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询 Bug 详情失败", requestId, { reason: String(error) });
      }
    },
  };
}
