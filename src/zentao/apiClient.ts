import { ZenTaoApiError, toErrorCode } from "../domain/errors.js";
import type { PaginationInput } from "../domain/types.js";
import { ENDPOINTS, withQuery } from "./endpoints.js";
import type { ZenTaoAuthClient } from "./authClient.js";

type QueryInput = PaginationInput & {
  status?: string;
  keyword?: string;
  assignedTo?: string;
  severity?: string;
  browse?: string;
};

export type CreateBugInput = {
  title: string;
  severity: number;
  pri: number;
  type: string;
  steps?: string;
  module?: number;
  project?: number;
  execution?: number;
  story?: number;
  task?: number;
  keywords?: string;
  deadline?: string;
  os?: string;
  browser?: string;
  openedBuild?: string[];
};

export type ConfirmBugInput = {
  assignedTo?: string;
  comment?: string;
  pri?: number;
  type?: string;
  mailto?: string[];
};

export type CloseBugInput = {
  comment?: string;
};

export type ActivateBugInput = {
  assignedTo?: string;
  comment?: string;
};

export type ResolveBugInput = {
  resolution: "fixed" | "bydesign" | "duplicate" | "external" | "notrepro" | "postponed" | "willnotfix";
  resolvedBuild?: string;
  comment?: string;
  duplicateBug?: number;
  assignedTo?: string;
  mailto?: string[];
};

export type CreateStoryInput = {
  title: string;
  spec: string;
  reviewer: string[];
  verify?: string;
  pri?: number;
  category?: string;
  source?: string;
  sourceNote?: string;
  keywords?: string;
  module?: number;
  branch?: number;
  assignedTo?: string;
};

export type CreateTaskInput = {
  name: string;
  type: string;
  pri?: number;
  desc?: string;
  assignedTo?: string;
  estimate?: number;
  story?: number;
  module?: number;
  deadline?: string;
  /** 预计开始 YYYY-MM-DD；本环境创建任务时常必填 */
  estStarted?: string;
};

export type UpdateTaskInput = {
  name?: string;
  type?: string;
  pri?: number;
  desc?: string;
  assignedTo?: string;
  estimate?: number;
  story?: number;
  module?: number;
  deadline?: string;
  status?: string;
};

export type StartTaskInput = {
  consumed: number;
  comment?: string;
};

export type PauseTaskInput = {
  comment?: string;
};

export type RestartTaskInput = {
  comment?: string;
};

export type FinishTaskInput = {
  consumed: number;
  left?: number;
  comment?: string;
  /** 实际完成日期/时间；本环境完成任务时常必填 */
  finishedDate?: string;
  /** 实际开始日期/时间；本环境未 start 直接 finish 时常必填 */
  realStarted?: string;
  /**
   * 本次消耗。若任务已 start 并记过工，finish 再传大额 currentConsumed/consumed 会叠加
   *（例如 start 记 16 后再 finish 传 16 → 总消耗 32）。
   */
  currentConsumed?: number;
};

export type CloseTaskInput = {
  comment?: string;
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

  async listProducts(query: QueryInput): Promise<unknown> {
    const path = withQuery(ENDPOINTS.products, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.keyword,
    });
    return this.get(path);
  }

  async getProduct(productId: number): Promise<unknown> {
    return this.get(ENDPOINTS.productById(productId));
  }

  async listUsers(query: QueryInput): Promise<unknown> {
    const path = withQuery(ENDPOINTS.users, {
      page: query.page,
      limit: query.limit,
      browse: query.browse,
    });
    return this.get(path);
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

  async listBuilds(executionId: number, query: QueryInput): Promise<unknown> {
    const path = ENDPOINTS.buildsByExecution(executionId);
    return this.get(
      withQuery(path, {
        page: query.page,
        limit: query.limit,
        q: query.keyword,
      }),
    );
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

  async createStory(productId: number, payload: CreateStoryInput): Promise<unknown> {
    return this.post(ENDPOINTS.createStoryByProduct(productId), payload as unknown as Record<string, unknown>);
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

  async createTask(executionId: number, payload: CreateTaskInput): Promise<unknown> {
    return this.post(ENDPOINTS.createTaskByExecution(executionId), payload as unknown as Record<string, unknown>);
  }

  async updateTask(taskId: number, payload: UpdateTaskInput): Promise<unknown> {
    return this.put(ENDPOINTS.taskById(taskId), payload);
  }

  async startTask(taskId: number, payload: StartTaskInput): Promise<unknown> {
    return this.post(ENDPOINTS.startTaskById(taskId), payload);
  }

  async pauseTask(taskId: number, payload: PauseTaskInput): Promise<unknown> {
    return this.post(ENDPOINTS.pauseTaskById(taskId), payload);
  }

  async restartTask(taskId: number, payload: RestartTaskInput): Promise<unknown> {
    return this.post(ENDPOINTS.restartTaskById(taskId), payload);
  }

  async finishTask(taskId: number, payload: FinishTaskInput): Promise<unknown> {
    return this.post(ENDPOINTS.finishTaskById(taskId), payload as unknown as Record<string, unknown>);
  }

  async closeTask(taskId: number, payload: CloseTaskInput): Promise<unknown> {
    return this.post(ENDPOINTS.closeTaskById(taskId), payload);
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

  async createBug(productId: number, payload: CreateBugInput): Promise<unknown> {
    return this.post(ENDPOINTS.createBugByProduct(productId), payload);
  }

  async confirmBug(bugId: number, payload: ConfirmBugInput): Promise<unknown> {
    return this.post(ENDPOINTS.confirmBugById(bugId), payload);
  }

  async closeBug(bugId: number, payload: CloseBugInput): Promise<unknown> {
    return this.post(ENDPOINTS.closeBugById(bugId), payload);
  }

  async activateBug(bugId: number, payload: ActivateBugInput): Promise<unknown> {
    return this.post(ENDPOINTS.activateBugById(bugId), payload);
  }

  async resolveBug(bugId: number, payload: ResolveBugInput): Promise<unknown> {
    return this.post(ENDPOINTS.resolveBugById(bugId), payload);
  }

  private async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", path, false, body);
  }

  private async put(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request("PUT", path, false, body);
  }

  private async request(
    method: string,
    path: string,
    hasRetriedAuth = false,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
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
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as unknown;

      if ((response.status === 401 || response.status === 403) && !hasRetriedAuth) {
        await this.authClient.getToken(true);
        return this.request(method, path, true, body);
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
