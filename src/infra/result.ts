import type { ErrorCode } from "../domain/errors.js";
import type { StandardResult } from "../domain/types.js";

export function buildRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function okResult<T>(
  data: T,
  requestId: string,
  page?: number,
  limit?: number,
  total?: number,
): StandardResult<T> {
  return {
    ok: true,
    data,
    meta: { requestId, page, limit, total },
  };
}

export function errResult(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): StandardResult<null> {
  return {
    ok: false,
    data: null,
    meta: { requestId },
    error: {
      code,
      message,
      details,
    },
  };
}
