import { ZenTaoApiError, toErrorCode } from "../domain/errors.js";
import type { PaginationInput } from "../domain/types.js";
import { ENDPOINTS, withQuery } from "./endpoints.js";
import type { ZenTaoAuthClient } from "./authClient.js";

type QueryInput = PaginationInput & {
  status?: string;
  keyword?: string;
  assignedTo?: string;
  severity?: string;
};

export class ZenTaoApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly authClient: ZenTaoAuthClient;

  constructor(baseUrl: string, timeoutMs: number, authClient: ZenTaoAuthClient) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.authClient = authClient;
  }

  async healthCheck(verifyAuth = true): Promise<Record<string, unknown>> {
    if (!verifyAuth) {
      return {
        baseUrl: this.baseUrl,
        authenticated: false,
        checkedAt: new Date().toISOString(),
      };
    }
    await this.authClient.getToken();
    return {
      baseUrl: this.baseUrl,
      authenticated: true,
      checkedAt: new Date().toISOString(),
    };
  }

  async listProjects(query: QueryInput): Promise<unknown> {
    const path = withQuery(ENDPOINTS.projects, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.keyword,
    });
    return this.get(path);
  }

  async getProject(projectId: number): Promise<unknown> {
    return this.get(ENDPOINTS.projectById(projectId));
  }

  async listStories(scope: "product" | "project", scopeId: number, query: QueryInput): Promise<unknown> {
    const path =
      scope === "product"
        ? ENDPOINTS.storiesByProduct(scopeId)
        : ENDPOINTS.storiesByProject(scopeId);
    return this.get(
      withQuery(path, {
        page: query.page,
        limit: query.limit,
        status: query.status,
        assignedTo: query.assignedTo,
        q: query.keyword,
      }),
    );
  }

  async getStory(storyId: number): Promise<unknown> {
    return this.get(ENDPOINTS.storyById(storyId));
  }

  async listExecutions(projectId: number, query: QueryInput): Promise<unknown> {
    const path = ENDPOINTS.executionsByProject(projectId);
    return this.get(
      withQuery(path, {
        page: query.page,
        limit: query.limit,
        status: query.status,
        q: query.keyword,
      }),
    );
  }

  async listTasks(scope: "execution" | "project", scopeId: number, query: QueryInput): Promise<unknown> {
    const path =
      scope === "execution"
        ? ENDPOINTS.tasksByExecution(scopeId)
        : ENDPOINTS.tasksByProject(scopeId);
    return this.get(
      withQuery(path, {
        page: query.page,
        limit: query.limit,
        status: query.status,
        assignedTo: query.assignedTo,
        q: query.keyword,
      }),
    );
  }

  async getTask(taskId: number): Promise<unknown> {
    return this.get(ENDPOINTS.taskById(taskId));
  }

  async listBugs(scope: "product" | "project", scopeId: number, query: QueryInput): Promise<unknown> {
    const path =
      scope === "product"
        ? ENDPOINTS.bugsByProduct(scopeId)
        : ENDPOINTS.bugsByProject(scopeId);
    return this.get(
      withQuery(path, {
        page: query.page,
        limit: query.limit,
        status: query.status,
        assignedTo: query.assignedTo,
        severity: query.severity,
        q: query.keyword,
      }),
    );
  }

  async getBug(bugId: number): Promise<unknown> {
    return this.get(ENDPOINTS.bugById(bugId));
  }

  private async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  private async request(method: string, path: string, hasRetriedAuth = false): Promise<unknown> {
    const token = await this.authClient.getToken(hasRetriedAuth);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Token: token,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as unknown;

      if ((response.status === 401 || response.status === 403) && !hasRetriedAuth) {
        await this.authClient.getToken(true);
        return this.request(method, path, true);
      }

      if (!response.ok) {
        throw new ZenTaoApiError(
          toErrorCode(response.status),
          `禅道接口调用失败: HTTP ${response.status}`,
          response.status,
          { path, response: payload as Record<string, unknown> },
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof ZenTaoApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ZenTaoApiError("UPSTREAM_TIMEOUT", "调用禅道接口超时", undefined, { path });
      }
      throw new ZenTaoApiError("UPSTREAM_ERROR", "调用禅道接口发生未知错误", undefined, {
        path,
        reason: String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
