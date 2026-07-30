import { ZenTaoApiError } from "../domain/errors.js";
import { mapBugDetail, mapBugList } from "../domain/mappers.js";
import { errResult, okResult } from "../infra/result.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import type {
  ActivateBugInput,
  CloseBugInput,
  ConfirmBugInput,
  CreateBugInput,
  ResolveBugInput,
} from "../zentao/apiClient.js";
import { postProcessList } from "./listPostProcess.js";
import {
  asRecord,
  authInputSchemaProperties,
  readEnum,
  readPagination,
  readPositiveInt,
  readSortOrder,
  readStringArray,
  readString,
} from "./common.js";

export function createBugTools(context: ToolContext): ToolDefinition[] {
  return [
    createListBugsTool(context),
    createGetBugTool(context),
    createCreateBugTool(context),
    createAssignBugTool(context),
    createResolveBugTool(context),
    createCloseBugTool(context),
    createActivateBugTool(context),
  ];
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
    description:
      "按 Bug ID 获取 Bug 详情；data.raw.actions[] 包含备注/历史动作，actions[].comment 常可用于提取 MR/补充说明",
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

function createCreateBugTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_create_bug",
    description: "创建 Bug（写操作）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        productId: { type: "integer", minimum: 1 },
        title: { type: "string", minLength: 1 },
        severity: { type: "integer", minimum: 1 },
        priority: { type: "integer", minimum: 1 },
        type: {
          type: "string",
          enum: [
            "codeerror",
            "config",
            "install",
            "security",
            "performance",
            "standard",
            "automation",
            "designdefect",
            "others",
          ],
        },
        steps: { type: "string" },
        module: { type: "integer", minimum: 1 },
        project: { type: "integer", minimum: 1 },
        execution: { type: "integer", minimum: 1 },
        story: { type: "integer", minimum: 1 },
        task: { type: "integer", minimum: 1 },
        keywords: { type: "string" },
        deadline: { type: "string" },
        os: { type: "string" },
        browser: { type: "string" },
        openedBuild: {
          type: "array",
          items: {
            oneOf: [{ type: "string" }, { type: "integer" }],
          },
          minItems: 1,
        },
      },
      required: ["productId", "title", "severity", "priority", "type"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `bug_create_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const productId = readPositiveInt(args, "productId", true);
        const title = readString(args, "title");
        if (!title) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 title 不能为空");
        const severity = readPositiveInt(args, "severity", true);
        const priority = readPositiveInt(args, "priority", true);
        const bugType = readString(args, "type");
        if (!bugType) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 type 不能为空");

        const payload: CreateBugInput = {
          title,
          severity,
          pri: priority,
          type: bugType,
        };

        const steps = readString(args, "steps");
        if (steps) payload.steps = steps;
        const module = readPositiveInt(args, "module", false, 0);
        if (module > 0) payload.module = module;
        const project = readPositiveInt(args, "project", false, 0);
        if (project > 0) payload.project = project;
        const execution = readPositiveInt(args, "execution", false, 0);
        if (execution > 0) payload.execution = execution;
        const story = readPositiveInt(args, "story", false, 0);
        if (story > 0) payload.story = story;
        const task = readPositiveInt(args, "task", false, 0);
        if (task > 0) payload.task = task;
        const keywords = readString(args, "keywords");
        if (keywords) payload.keywords = keywords;
        const deadline = readString(args, "deadline");
        if (deadline) payload.deadline = deadline;
        const os = readString(args, "os");
        if (os) payload.os = os;
        const browser = readString(args, "browser");
        if (browser) payload.browser = browser;
        const openedBuild = readStringArray(args, "openedBuild");
        if (openedBuild && openedBuild.length > 0) payload.openedBuild = openedBuild;

        const result = await apiClient.createBug(productId, payload);
        return okResult(mapBugDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "创建 Bug 失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createAssignBugTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_assign_bug",
    description: "指派 Bug（基于 confirm 动作）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        bugId: { type: "integer", minimum: 1 },
        assignedTo: { type: "string", minLength: 1 },
        comment: { type: "string" },
        priority: { type: "integer", minimum: 1 },
        type: {
          type: "string",
          enum: [
            "codeerror",
            "config",
            "install",
            "security",
            "performance",
            "standard",
            "automation",
            "designdefect",
            "others",
          ],
        },
        mailto: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
      },
      required: ["bugId", "assignedTo"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `bug_assign_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const bugId = readPositiveInt(args, "bugId", true);
        const assignedTo = readString(args, "assignedTo");
        if (!assignedTo) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 assignedTo 不能为空");

        const payload: ConfirmBugInput = { assignedTo };
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;
        const priority = readPositiveInt(args, "priority", false, 0);
        if (priority > 0) payload.pri = priority;
        const type = readString(args, "type");
        if (type) payload.type = type;
        const mailto = readStringArray(args, "mailto");
        if (mailto && mailto.length > 0) payload.mailto = mailto;

        const result = await apiClient.confirmBug(bugId, payload);
        return okResult(mapBugDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "指派 Bug 失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createResolveBugTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_resolve_bug",
    description: "解决 Bug",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        bugId: { type: "integer", minimum: 1 },
        resolution: {
          type: "string",
          enum: ["fixed", "bydesign", "duplicate", "external", "notrepro", "postponed", "willnotfix"],
        },
        resolvedBuild: {
          type: "string",
          description: "解决版本，如 trunk 或禅道版本/构建名称",
        },
        comment: { type: "string" },
        duplicateBug: { type: "integer", minimum: 1 },
        assignedTo: { type: "string" },
        mailto: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
      },
      required: ["bugId", "resolution"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `bug_resolve_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const bugId = readPositiveInt(args, "bugId", true);
        const resolution = readEnum(
          args,
          "resolution",
          ["fixed", "bydesign", "duplicate", "external", "notrepro", "postponed", "willnotfix"] as const,
        );
        if (!resolution) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 resolution 不能为空");

        const payload: ResolveBugInput = { resolution };
        const resolvedBuild = readString(args, "resolvedBuild");
        if (resolvedBuild) payload.resolvedBuild = resolvedBuild;
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;
        const duplicateBug = readPositiveInt(args, "duplicateBug", false, 0);
        if (duplicateBug > 0) payload.duplicateBug = duplicateBug;
        const assignedTo = readString(args, "assignedTo");
        if (assignedTo) payload.assignedTo = assignedTo;
        const mailto = readStringArray(args, "mailto");
        if (mailto && mailto.length > 0) payload.mailto = mailto;

        const result = await apiClient.resolveBug(bugId, payload);
        return okResult(mapBugDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "解决 Bug 失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createCloseBugTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_close_bug",
    description: "关闭 Bug",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        bugId: { type: "integer", minimum: 1 },
        comment: { type: "string" },
      },
      required: ["bugId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `bug_close_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const bugId = readPositiveInt(args, "bugId", true);
        const payload: CloseBugInput = {};
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;

        const result = await apiClient.closeBug(bugId, payload);
        return okResult(mapBugDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "关闭 Bug 失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createActivateBugTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_activate_bug",
    description: "激活（重新打开）Bug",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        bugId: { type: "integer", minimum: 1 },
        assignedTo: { type: "string" },
        comment: { type: "string" },
      },
      required: ["bugId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `bug_activate_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const bugId = readPositiveInt(args, "bugId", true);
        const payload: ActivateBugInput = {};
        const assignedTo = readString(args, "assignedTo");
        if (assignedTo) payload.assignedTo = assignedTo;
        const comment = readString(args, "comment");
        if (comment) payload.comment = comment;

        const result = await apiClient.activateBug(bugId, payload);
        return okResult(mapBugDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "激活 Bug 失败", requestId, { reason: String(error) });
      }
    },
  };
}
