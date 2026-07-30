import { ZenTaoApiError } from "../domain/errors.js";
import { mapUserList } from "../domain/mappers.js";
import { errResult, okResult } from "../infra/result.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import { postProcessList } from "./listPostProcess.js";
import {
  asRecord,
  authInputSchemaProperties,
  readPagination,
  readSortOrder,
  readString,
} from "./common.js";

export function createUserTools(context: ToolContext): ToolDefinition[] {
  return [createListUsersTool(context)];
}

function createListUsersTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_users",
    description: "查询用户列表（用于解析 assignedTo 账号；可用 keyword 按 account/realname 过滤）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        browse: {
          type: "string",
          description: "人员类型：inside（内部，默认）/ outside（外部）；其它值通常表示全部",
        },
        keyword: { type: "string" },
        sortBy: { type: "string", enum: ["id", "account", "realname", "role"] },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `users_${Date.now()}`;
      const args = asRecord(rawArgs);
      const { page, limit } = readPagination(
        args,
        context.config.defaultPage,
        context.config.defaultLimit,
        context.config.maxLimit,
      );

      try {
        const apiClient = context.getApiClientForArgs(args);
        const payload = await apiClient.listUsers({
          page,
          limit,
          browse: readString(args, "browse"),
        });
        const mapped = mapUserList(payload);
        const filteredItems = postProcessList({
          items: mapped.items,
          keyword: readString(args, "keyword"),
          keywordSelector: (item) => [item.account, item.realname, item.role, item.email],
          equalsFilters: [],
          sortBy: readString(args, "sortBy"),
          sortOrder: readSortOrder(args) ?? "asc",
          sortSelectors: {
            id: (item) => item.id,
            account: (item) => item.account,
            realname: (item) => item.realname,
            role: (item) => item.role,
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
        return errResult("UPSTREAM_ERROR", "查询用户列表失败", requestId, { reason: String(error) });
      }
    },
  };
}
