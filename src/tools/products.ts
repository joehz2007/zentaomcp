import { ZenTaoApiError } from "../domain/errors.js";
import { mapProductDetail, mapProductList } from "../domain/mappers.js";
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

export function createProductTools(context: ToolContext): ToolDefinition[] {
  return [createListProductsTool(context), createGetProductTool(context)];
}

function createListProductsTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_products",
    description: "查询产品列表（支持分页、过滤、排序；用于获取 list_bugs 所需 productId）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        page: { type: "integer", minimum: 1, default: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        status: { type: "string" },
        keyword: { type: "string" },
        sortBy: { type: "string", enum: ["id", "name", "status", "code", "owner"] },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `products_${Date.now()}`;
      const args = asRecord(rawArgs);
      const { page, limit } = readPagination(
        args,
        context.config.defaultPage,
        context.config.defaultLimit,
        context.config.maxLimit,
      );

      try {
        const apiClient = context.getApiClientForArgs(args);
        const payload = await apiClient.listProducts({
          page,
          limit,
          status: readString(args, "status"),
          keyword: readString(args, "keyword"),
        });
        const mapped = mapProductList(payload);
        const filteredItems = postProcessList({
          items: mapped.items,
          keyword: readString(args, "keyword"),
          keywordSelector: (item) => [item.name, item.code, item.owner],
          equalsFilters: [
            { value: readString(args, "status"), selector: (item) => item.status },
          ],
          sortBy: readString(args, "sortBy"),
          sortOrder: readSortOrder(args) ?? "asc",
          sortSelectors: {
            id: (item) => item.id,
            name: (item) => item.name,
            status: (item) => item.status,
            code: (item) => item.code,
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
        return errResult("UPSTREAM_ERROR", "查询产品列表失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createGetProductTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_get_product",
    description: "按产品 ID 获取产品详情",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        productId: { type: "integer", minimum: 1 },
      },
      required: ["productId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `product_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const productId = readPositiveInt(args, "productId", true);
        const payload = await apiClient.getProduct(productId);
        return okResult(mapProductDetail(payload), requestId);
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询产品详情失败", requestId, { reason: String(error) });
      }
    },
  };
}
