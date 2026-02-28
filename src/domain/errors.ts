export type ErrorCode =
  | "AUTH_FAILED"
  | "PERMISSION_DENIED"
  | "INVALID_ARGUMENT"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR";

export class ZenTaoApiError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    status?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ZenTaoApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toErrorCode(status: number): ErrorCode {
  if (status === 401) return "AUTH_FAILED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 408 || status === 504) return "UPSTREAM_TIMEOUT";
  return "UPSTREAM_ERROR";
}
