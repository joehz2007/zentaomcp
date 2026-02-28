import { ZenTaoApiError, toErrorCode } from "../domain/errors.js";
import { ENDPOINTS } from "./endpoints.js";

interface TokenCache {
  value: string;
  expiresAt: number;
}

export interface ZenTaoAuthClientOptions {
  baseUrl: string;
  account: string;
  password: string;
  timeoutMs: number;
  tokenTtlMs: number;
}

export class ZenTaoAuthClient {
  private readonly baseUrl: string;
  private readonly account: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly tokenTtlMs: number;
  private tokenCache?: TokenCache;

  constructor(options: ZenTaoAuthClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.account = options.account;
    this.password = options.password;
    this.timeoutMs = options.timeoutMs;
    this.tokenTtlMs = options.tokenTtlMs;
  }

  async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.value;
    }

    if (!this.baseUrl || !this.account || !this.password) {
      throw new ZenTaoApiError(
        "INVALID_ARGUMENT",
        "缺少禅道连接配置，请检查 ZENTAO_BASE_URL/ZENTAO_ACCOUNT/ZENTAO_PASSWORD",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${ENDPOINTS.tokens}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: this.account, password: this.password }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new ZenTaoApiError(
          toErrorCode(response.status),
          `获取禅道 Token 失败: HTTP ${response.status}`,
          response.status,
          { response: payload },
        );
      }

      const token = extractToken(payload);
      if (!token) {
        throw new ZenTaoApiError("UPSTREAM_ERROR", "禅道返回中未找到 token 字段", response.status, {
          response: payload,
        });
      }

      this.tokenCache = { value: token, expiresAt: Date.now() + this.tokenTtlMs };
      return token;
    } catch (error) {
      if (error instanceof ZenTaoApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ZenTaoApiError("UPSTREAM_TIMEOUT", "获取禅道 Token 超时");
      }
      throw new ZenTaoApiError("UPSTREAM_ERROR", "获取禅道 Token 时发生未知错误", undefined, {
        reason: String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractToken(payload: Record<string, unknown>): string | undefined {
  const tokenField = payload.token;
  if (typeof tokenField === "string" && tokenField.trim()) return tokenField;

  if (
    tokenField &&
    typeof tokenField === "object" &&
    typeof (tokenField as Record<string, unknown>).token === "string"
  ) {
    return ((tokenField as Record<string, unknown>).token as string).trim();
  }

  const dataField = payload.data;
  if (dataField && typeof dataField === "object") {
    const nestedToken = (dataField as Record<string, unknown>).token;
    if (typeof nestedToken === "string" && nestedToken.trim()) return nestedToken.trim();
  }
  return undefined;
}
