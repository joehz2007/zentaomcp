import { ZenTaoApiError, toErrorCode } from "../domain/errors.js";
import { ENDPOINTS } from "./endpoints.js";

interface SessionCache {
  cookie: string;
  expiresAt: number;
}

export interface ZenTaoSessionAuthClientOptions {
  baseUrl: string;
  account: string;
  password: string;
  timeoutMs: number;
  sessionTtlMs: number;
}

export class ZenTaoSessionAuthClient {
  private readonly baseUrl: string;
  private readonly account: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly sessionTtlMs: number;
  private sessionCache?: SessionCache;

  constructor(options: ZenTaoSessionAuthClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.account = options.account;
    this.password = options.password;
    this.timeoutMs = options.timeoutMs;
    this.sessionTtlMs = options.sessionTtlMs;
  }

  async getCookie(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.sessionCache && this.sessionCache.expiresAt > Date.now()) {
      return this.sessionCache.cookie;
    }
    if (!this.baseUrl || !this.account || !this.password) {
      throw new ZenTaoApiError(
        "INVALID_ARGUMENT",
        "缺少禅道连接配置，请检查 ZENTAO_BASE_URL/ZENTAO_ACCOUNT/ZENTAO_PASSWORD",
      );
    }

    const sessionResponse = await this.requestJson("GET", ENDPOINTS.sessionId);
    const sessionId = extractSessionId(sessionResponse.payload);
    const sessionCookie =
      firstCookiePair(sessionResponse.response.headers) ??
      (sessionId ? `zentaosid=${sessionId}` : undefined);

    const loginHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    };
    if (sessionCookie) {
      loginHeaders.Cookie = sessionCookie;
    }

    const loginResponse = await this.requestJson(
      "POST",
      ENDPOINTS.userLogin,
      new URLSearchParams({
        account: this.account,
        password: this.password,
      }).toString(),
      loginHeaders,
    );

    const loginCookie = firstCookiePair(loginResponse.response.headers) ?? sessionCookie;
    if (!loginCookie) {
      throw new ZenTaoApiError("UPSTREAM_ERROR", "登录禅道后未获取到会话 Cookie");
    }
    if (isLoginFailed(loginResponse.payload)) {
      throw new ZenTaoApiError("AUTH_FAILED", "禅道会话登录失败", loginResponse.response.status, {
        response: loginResponse.payload,
      });
    }

    this.sessionCache = {
      cookie: loginCookie,
      expiresAt: Date.now() + this.sessionTtlMs,
    };
    return loginCookie;
  }

  private async requestJson(
    method: string,
    path: string,
    body?: string,
    headers?: Record<string, string>,
  ): Promise<{ response: Response; payload: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ZenTaoApiError(
          toErrorCode(response.status),
          `会话接口调用失败: HTTP ${response.status}`,
          response.status,
          { path, response: payload as Record<string, unknown> },
        );
      }
      return { response, payload };
    } catch (error) {
      if (error instanceof ZenTaoApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ZenTaoApiError("UPSTREAM_TIMEOUT", "调用禅道会话接口超时", undefined, { path });
      }
      throw new ZenTaoApiError("UPSTREAM_ERROR", "调用禅道会话接口发生未知错误", undefined, {
        path,
        reason: String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function asObject(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === "object") return input as Record<string, unknown>;
  return undefined;
}

function asString(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  const text = String(input).trim();
  return text || undefined;
}

function extractSessionId(payload: unknown): string | undefined {
  const root = asObject(payload);
  if (!root) return undefined;

  const direct = asString(root.sessionID ?? root.sessionId);
  if (direct) return direct;

  const data = asObject(root.data);
  if (!data) return undefined;
  return asString(data.sessionID ?? data.sessionId);
}

function isLoginFailed(payload: unknown): boolean {
  const root = asObject(payload);
  if (!root) return false;
  const status = asString(root.status ?? root.result);
  if (!status) return false;
  return ["fail", "failed", "error"].includes(status.toLowerCase());
}

function firstCookiePair(headers: Headers): string | undefined {
  const getSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const cookies =
    typeof getSetCookie.getSetCookie === "function"
      ? getSetCookie.getSetCookie()
      : [headers.get("set-cookie")].filter((item): item is string => Boolean(item));
  if (cookies.length === 0) return undefined;
  const first = cookies[0]?.split(";")[0]?.trim();
  return first || undefined;
}
