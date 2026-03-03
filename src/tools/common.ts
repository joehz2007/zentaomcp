import { ZenTaoApiError } from "../domain/errors.js";
import type { PaginationInput } from "../domain/types.js";

type Args = Record<string, unknown>;

export const authInputSchemaProperties = {
  baseUrl: { type: "string" },
  account: { type: "string" },
  password: { type: "string" },
} as const;

export function asRecord(input: unknown): Args {
  if (input && typeof input === "object") return input as Args;
  return {};
}

export function readPositiveInt(
  args: Args,
  key: string,
  required: boolean,
  fallback?: number,
): number {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ZenTaoApiError("INVALID_ARGUMENT", `缺少参数 ${key}`);
    if (fallback !== undefined) return fallback;
    throw new ZenTaoApiError("INVALID_ARGUMENT", `缺少参数 ${key}`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ZenTaoApiError("INVALID_ARGUMENT", `参数 ${key} 必须为正整数`);
  }
  return parsed;
}

export function readString(args: Args, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function readStringArray(args: Args, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => readString({ item }, "item"))
      .filter((item): item is string => Boolean(item));
    return normalized.length > 0 ? normalized : undefined;
  }
  const single = readString(args, key);
  return single ? [single] : undefined;
}

export function readEnum<T extends string>(
  args: Args,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = readString(args, key);
  if (!value) return undefined;
  if (!allowed.includes(value as T)) {
    throw new ZenTaoApiError(
      "INVALID_ARGUMENT",
      `参数 ${key} 取值非法，允许值: ${allowed.join(",")}`,
    );
  }
  return value as T;
}

export function readPagination(
  args: Args,
  defaultPage: number,
  defaultLimit: number,
  maxLimit: number,
): Required<PaginationInput> {
  const page = args.page === undefined ? defaultPage : readPositiveInt(args, "page", false, defaultPage);
  const limitRaw =
    args.limit === undefined ? defaultLimit : readPositiveInt(args, "limit", false, defaultLimit);
  const limit = Math.min(limitRaw, maxLimit);
  return { page, limit };
}

export function readSortOrder(args: Args): "asc" | "desc" | undefined {
  return readEnum(args, "sortOrder", ["asc", "desc"] as const);
}

export function extractTotal(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  const total =
    obj.total ??
    (obj.pager && typeof obj.pager === "object"
      ? (obj.pager as Record<string, unknown>).recTotal
      : undefined);
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : undefined;
}
