import { ZenTaoApiError } from "../domain/errors.js";
import { mapStoryDetail, mapStoryList } from "../domain/mappers.js";
import { errResult, okResult } from "../infra/result.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import type { CreateStoryInput } from "../zentao/apiClient.js";
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
  return [
    createListStoriesTool(context),
    createGetStoryTool(context),
    createCreateStoryTool(context),
  ];
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
    description: "按需求 ID 获取需求详情；返回 data.raw 保留禅道原始字段，其中 raw.actions[] 包含需求备注/评论/历史动作，actions[].comment 常用于提取 PR 链接或补充说明。",
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

function createCreateStoryTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_create_story",
    description:
      "在产品下创建需求（写操作）。reviewer 必须为 string[]（传字符串会被服务端当成空）；branch 必须为数字，默认 0。",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        productId: { type: "integer", minimum: 1 },
        title: { type: "string", minLength: 1 },
        spec: { type: "string", minLength: 1 },
        reviewer: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
        },
        verify: { type: "string" },
        pri: { type: "integer", minimum: 1 },
        category: { type: "string" },
        source: { type: "string" },
        sourceNote: { type: "string" },
        keywords: { type: "string" },
        module: { type: "integer", minimum: 0 },
        branch: { type: "integer", minimum: 0, default: 0 },
        assignedTo: { type: "string" },
      },
      required: ["productId", "title", "spec", "reviewer"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `story_create_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const productId = readPositiveInt(args, "productId", true);
        const title = readString(args, "title");
        if (!title) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 title 不能为空");
        const spec = readString(args, "spec");
        if (!spec) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 spec 不能为空");
        const reviewer = readRequiredReviewerArray(args);

        const payload: CreateStoryInput = {
          title,
          spec,
          reviewer,
          branch: readBranch(args),
        };
        const verify = readString(args, "verify");
        if (verify) payload.verify = verify;
        const pri = readPositiveInt(args, "pri", false, 0);
        if (pri > 0) payload.pri = pri;
        const category = readString(args, "category");
        if (category) payload.category = category;
        const source = readString(args, "source");
        if (source) payload.source = source;
        const sourceNote = readString(args, "sourceNote");
        if (sourceNote) payload.sourceNote = sourceNote;
        const keywords = readString(args, "keywords");
        if (keywords) payload.keywords = keywords;
        if (args.module !== undefined && args.module !== null && args.module !== "") {
          const module = Number(args.module);
          if (!Number.isInteger(module) || module < 0) {
            throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 module 必须为大于等于 0 的整数");
          }
          payload.module = module;
        }
        const assignedTo = readString(args, "assignedTo");
        if (assignedTo) payload.assignedTo = assignedTo;

        const result = await apiClient.createStory(productId, payload);
        return okResult(mapStoryDetail(result), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "创建需求失败", requestId, { reason: String(error) });
      }
    },
  };
}

function readRequiredReviewerArray(args: Record<string, unknown>): string[] {
  const value = args.reviewer;
  if (!Array.isArray(value)) {
    throw new ZenTaoApiError(
      "INVALID_ARGUMENT",
      "参数 reviewer 必须为 string[]（不可传单个字符串，服务端会当成空）",
    );
  }
  const reviewers = value
    .map((item) => (item === undefined || item === null ? "" : String(item).trim()))
    .filter((item) => Boolean(item));
  if (reviewers.length === 0) {
    throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 reviewer 至少包含一个账号");
  }
  return reviewers;
}

function readBranch(args: Record<string, unknown>): number {
  if (args.branch === undefined || args.branch === null || args.branch === "") return 0;
  const branch = Number(args.branch);
  if (!Number.isInteger(branch) || branch < 0) {
    throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 branch 必须为大于等于 0 的整数");
  }
  return branch;
}
