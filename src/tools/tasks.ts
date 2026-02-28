import { ZenTaoApiError } from "../domain/errors.js";
import { mapTaskDetail, mapTaskList } from "../domain/mappers.js";
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

export function createTaskTools(context: ToolContext): ToolDefinition[] {
  return [createListTasksTool(context), createGetTaskTool(context)];
}

function createListTasksTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_tasks",
    description: "查询任务列表（scope=execution|project，占位版）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        scope: { type: "string", enum: ["execution", "project"] },
        scopeId: { type: "integer", minimum: 1 },
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        status: { type: "string" },
        assignedTo: { type: "string" },
        keyword: { type: "string" },
        sortBy: {
          type: "string",
          enum: [
            "id",
            "title",
            "status",
            "priority",
            "assignedTo",
            "deadline",
            "estimateHours",
            "consumedHours",
          ],
        },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      required: ["scope", "scopeId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `tasks_${Date.now()}`;
      const args = asRecord(rawArgs);
      let scope: "execution" | "project" | undefined;
      const { page, limit } = readPagination(
        args,
        context.config.defaultPage,
        context.config.defaultLimit,
        context.config.maxLimit,
      );
      try {
        const apiClient = context.getApiClientForArgs(args);
        scope = readEnum(args, "scope", ["execution", "project"] as const);
        if (!scope) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 scope 不能为空");
        const scopeId = readPositiveInt(args, "scopeId", true);
        const payload = await apiClient.listTasks(scope, scopeId, {
          page,
          limit,
          status: readString(args, "status"),
          assignedTo: readString(args, "assignedTo"),
          keyword: readString(args, "keyword"),
        });
        const mapped = mapTaskList(payload);
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
            priority: (item) => item.priority,
            assignedTo: (item) => item.assignedTo,
            deadline: (item) => item.deadline,
            estimateHours: (item) => item.estimateHours,
            consumedHours: (item) => item.consumedHours,
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
          if (scope === "project" && error.status === 404) {
            return errResult(
              "UPSTREAM_ERROR",
              "当前项目不支持 /projects/{projectId}/tasks，请先调用 zentao_list_executions 获取执行ID，再用 scope=execution 查询任务",
              requestId,
              {
                ...(error.details ?? {}),
                suggestion: {
                  tool: "zentao_list_executions",
                  arguments: { projectId: readPositiveInt(args, "scopeId", false, 1) },
                },
              },
            );
          }
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询任务列表失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createGetTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_get_task",
    description: "按任务 ID 获取任务详情（占位版）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const payload = await apiClient.getTask(taskId);
        return okResult(mapTaskDetail(payload), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询任务详情失败", requestId, { reason: String(error) });
      }
    },
  };
}
