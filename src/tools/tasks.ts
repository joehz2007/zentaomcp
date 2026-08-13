import { ZenTaoApiError } from "../domain/errors.js";
import { mapTaskDetail, mapTaskList } from "../domain/mappers.js";
import { errResult, okResult } from "../infra/result.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import type {
  CloseTaskInput,
  CreateTaskInput,
  FinishTaskInput,
  PauseTaskInput,
  RestartTaskInput,
  StartTaskInput,
  UpdateTaskInput,
} from "../zentao/apiClient.js";
import { ENDPOINTS } from "../zentao/endpoints.js";
import { buildRecordEffortFormFields } from "../zentao/editFormFields.js";
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
  return [
    createListTasksTool(context),
    createGetTaskTool(context),
    createCreateTaskTool(context),
    createUpdateTaskTool(context),
    createStartTaskTool(context),
    createPauseTaskTool(context),
    createRestartTaskTool(context),
    createFinishTaskTool(context),
    createCloseTaskTool(context),
    createRecordTaskEffortTool(context),
    createDeleteTaskEffortTool(context),
  ];
}

function createListTasksTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_tasks",
    description: "查询任务列表（scope=execution|project，支持分页、过滤、排序）",
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
    description: "按任务 ID 获取任务详情；返回 data.raw 保留禅道原始字段，其中 raw.actions[] 包含任务备注/评论/历史动作，actions[].comment 常用于提取 PR 链接。",
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

function createCreateTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_create_task",
    description: "在执行下创建任务（写操作）。本环境常需 estStarted、deadline。",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        executionId: { type: "integer", minimum: 1 },
        name: { type: "string", minLength: 1 },
        type: {
          type: "string",
          enum: ["design", "devel", "test", "study", "discuss", "ui", "affair", "misc"],
        },
        priority: { type: "integer", minimum: 1 },
        desc: { type: "string" },
        assignedTo: { type: "string" },
        estimate: { type: "number", minimum: 0 },
        story: { type: "integer", minimum: 1 },
        module: { type: "integer", minimum: 1 },
        deadline: {
          type: "string",
          description: "截止日期 YYYY-MM-DD；本环境创建任务时常必填（否则 400：『截止日期』不能为空）",
        },
        estStarted: {
          type: "string",
          description: "预计开始日期 YYYY-MM-DD；本环境创建任务时常必填（否则 400：『预计开始』不能为空）",
        },
      },
      required: ["executionId", "name", "type"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_create_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const executionId = readPositiveInt(args, "executionId", true);
        const name = readString(args, "name");
        if (!name) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 name 不能为空");
        const taskType = readString(args, "type");
        if (!taskType) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 type 不能为空");

        const payload: CreateTaskInput = { name, type: taskType };
        const priority = readPositiveInt(args, "priority", false, 0);
        if (priority > 0) payload.pri = priority;
        const desc = readString(args, "desc");
        if (desc) payload.desc = desc;
        const assignedTo = readString(args, "assignedTo");
        if (assignedTo) payload.assignedTo = assignedTo;
        const estimate = Number(args.estimate);
        if (Number.isFinite(estimate) && estimate >= 0) payload.estimate = estimate;
        const story = readPositiveInt(args, "story", false, 0);
        if (story > 0) payload.story = story;
        const module = readPositiveInt(args, "module", false, 0);
        if (module > 0) payload.module = module;
        const deadline = readString(args, "deadline");
        if (deadline) payload.deadline = deadline;
        const estStarted = readString(args, "estStarted");
        if (estStarted) payload.estStarted = estStarted;

        const result = await apiClient.createTask(executionId, payload);
        return okResult(mapTaskDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "创建任务失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createUpdateTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_update_task",
    description: "更新任务（写操作）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        name: { type: "string" },
        type: {
          type: "string",
          enum: ["design", "devel", "test", "study", "discuss", "ui", "affair", "misc"],
        },
        priority: { type: "integer", minimum: 1 },
        desc: { type: "string" },
        assignedTo: { type: "string" },
        estimate: { type: "number", minimum: 0 },
        story: { type: "integer", minimum: 1 },
        module: { type: "integer", minimum: 1 },
        deadline: { type: "string" },
        status: { type: "string" },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_update_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const payload: UpdateTaskInput = {};
        const name = readString(args, "name");
        if (name) payload.name = name;
        const taskType = readString(args, "type");
        if (taskType) payload.type = taskType;
        const priority = readPositiveInt(args, "priority", false, 0);
        if (priority > 0) payload.pri = priority;
        const desc = readString(args, "desc");
        if (desc) payload.desc = desc;
        const assignedTo = readString(args, "assignedTo");
        if (assignedTo) payload.assignedTo = assignedTo;
        const estimate = Number(args.estimate);
        if (Number.isFinite(estimate) && estimate >= 0) payload.estimate = estimate;
        const story = readPositiveInt(args, "story", false, 0);
        if (story > 0) payload.story = story;
        const module = readPositiveInt(args, "module", false, 0);
        if (module > 0) payload.module = module;
        const deadline = readString(args, "deadline");
        if (deadline) payload.deadline = deadline;
        const status = readString(args, "status");
        if (status) payload.status = status;
        if (Object.keys(payload).length === 0) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", "至少传入一个可更新字段");
        }

        const result = await apiClient.updateTask(taskId, payload);
        return okResult(mapTaskDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "更新任务失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createStartTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_start_task",
    description: "开始任务（写操作）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        consumed: { type: "number", minimum: 0 },
        comment: { type: "string" },
      },
      required: ["taskId", "consumed"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_start_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const consumed = Number(args.consumed);
        if (!Number.isFinite(consumed) || consumed < 0) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 consumed 必须为大于等于 0 的数字");
        }
        const payload: StartTaskInput = { consumed };
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;

        const result = await apiClient.startTask(taskId, payload);
        return okResult(mapTaskDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "开始任务失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createPauseTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_pause_task",
    description: "暂停任务（写操作）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        comment: { type: "string" },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_pause_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const payload: PauseTaskInput = {};
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;

        const result = await apiClient.pauseTask(taskId, payload);
        return okResult(mapTaskDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "暂停任务失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createRestartTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_restart_task",
    description: "重启任务（写操作）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        comment: { type: "string" },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_restart_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const payload: RestartTaskInput = {};
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;

        const result = await apiClient.restartTask(taskId, payload);
        return okResult(mapTaskDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "重启任务失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createFinishTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_finish_task",
    description:
      "完成任务（写操作）。本环境常需 finishedDate、realStarted；left 默认 0。若已 start 记过工，finish 再传大额 consumed/currentConsumed 会叠加（如 16+16=32），此时应用 currentConsumed 表示本次增量或避免重复记工。",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        consumed: { type: "number", minimum: 0 },
        left: { type: "number", minimum: 0, default: 0 },
        finishedDate: {
          type: "string",
          description: "实际完成日期/时间（YYYY-MM-DD 或 datetime）；本环境常必填（否则 400：『实际完成』不能为空）",
        },
        realStarted: {
          type: "string",
          description: "实际开始日期/时间（YYYY-MM-DD 或 datetime）；本环境未 start 直接 finish 时常必填（否则 400：实际开始不能为空）",
        },
        currentConsumed: {
          type: "number",
          minimum: 0,
          description: "本次消耗；已 start 记工时勿与大额 consumed 重复叠加",
        },
        comment: { type: "string" },
      },
      required: ["taskId", "consumed"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_finish_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const consumed = Number(args.consumed);
        if (!Number.isFinite(consumed) || consumed < 0) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 consumed 必须为大于等于 0 的数字");
        }
        const payload: FinishTaskInput = { consumed, left: 0 };
        if (args.left !== undefined && args.left !== null && args.left !== "") {
          const left = Number(args.left);
          if (!Number.isFinite(left) || left < 0) {
            throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 left 必须为大于等于 0 的数字");
          }
          payload.left = left;
        }
        const finishedDate = readString(args, "finishedDate");
        if (finishedDate) payload.finishedDate = finishedDate;
        const realStarted = readString(args, "realStarted");
        if (realStarted) payload.realStarted = realStarted;
        if (args.currentConsumed !== undefined && args.currentConsumed !== null && args.currentConsumed !== "") {
          const currentConsumed = Number(args.currentConsumed);
          if (!Number.isFinite(currentConsumed) || currentConsumed < 0) {
            throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 currentConsumed 必须为大于等于 0 的数字");
          }
          payload.currentConsumed = currentConsumed;
        }
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;

        const result = await apiClient.finishTask(taskId, payload);
        return okResult(mapTaskDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "完成任务失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createCloseTaskTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_close_task",
    description: "关闭任务（写操作）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        comment: { type: "string" },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_close_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const payload: CloseTaskInput = {};
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;

        const result = await apiClient.closeTask(taskId, payload);
        return okResult(mapTaskDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "关闭任务失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createRecordTaskEffortTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_record_task_effort",
    description:
      "为任务记工（会话接口 task-recordEstimate）。删除工时后若 consumed 异常，可再 record 一条校准。",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        date: { type: "string", description: "记工日期 YYYY-MM-DD" },
        consumed: { type: "number", minimum: 0 },
        left: { type: "number", minimum: 0 },
        work: { type: "string" },
        effortId: {
          type: "integer",
          minimum: 0,
          description: "已有工时记录 id；新建可不传",
        },
      },
      required: ["taskId", "date", "consumed", "left"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_record_effort_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const sessionClient = context.getSessionClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const date = readString(args, "date");
        if (!date) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 date 不能为空");
        const consumed = Number(args.consumed);
        if (!Number.isFinite(consumed) || consumed < 0) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 consumed 必须为大于等于 0 的数字");
        }
        const left = Number(args.left);
        if (!Number.isFinite(left) || left < 0) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 left 必须为大于等于 0 的数字");
        }
        const fields = buildRecordEffortFormFields([
          {
            id: args.effortId === undefined || args.effortId === null ? "" : Number(args.effortId),
            date,
            consumed,
            left,
            work: readString(args, "work"),
          },
        ]);
        const result = await sessionClient.postFormUrlEncoded(
          ENDPOINTS.taskRecordEstimateById(taskId),
          fields,
        );
        return okResult(
          {
            taskId,
            recorded: { date, consumed, left, work: readString(args, "work") },
            session: result.payload,
          },
          requestId,
        );
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "记工失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createDeleteTaskEffortTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_delete_task_effort",
    description:
      "删除任务工时记录（会话确认路径 task-deleteEstimate-{effortId}-yes）。删除后如 consumed 异常，可用 zentao_record_task_effort 校准。",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        effortId: { type: "integer", minimum: 1 },
      },
      required: ["effortId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_delete_effort_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const sessionClient = context.getSessionClientForArgs(args);
        const effortId = readPositiveInt(args, "effortId", true);
        const result = await sessionClient.getSession(ENDPOINTS.taskDeleteEstimateById(effortId));
        return okResult({ effortId, session: result.payload }, requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "删除工时失败", requestId, { reason: String(error) });
      }
    },
  };
}
