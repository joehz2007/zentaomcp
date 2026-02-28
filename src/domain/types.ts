import type { ErrorCode } from "./errors.js";

export interface StandardMeta {
  requestId: string;
  page?: number;
  limit?: number;
  total?: number;
}

export interface StandardError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface StandardResult<T = unknown> {
  ok: boolean;
  data: T | null;
  meta: StandardMeta;
  error?: StandardError;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export type ScopeType = "project" | "product" | "execution";
