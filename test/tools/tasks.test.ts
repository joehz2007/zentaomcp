import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZenTaoApiError } from "../../src/domain/errors.js";
import { createTaskTools } from "../../src/tools/tasks.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(
  overrides?: Partial<ToolContext["apiClient"]>,
): ToolContext {
  const apiClient = {
    listTasks: async () => ({ tasks: [] }),
    getTask: async () => {
      throw new Error("should not be called");
    },
    createTask: async () => ({ task: { id: 1, name: "new task" } }),
    updateTask: async () => ({ task: { id: 1, name: "updated task" } }),
    startTask: async () => ({ task: { id: 1, name: "started task" } }),
    pauseTask: async () => ({ task: { id: 1, name: "paused task" } }),
    restartTask: async () => ({ task: { id: 1, name: "restarted task" } }),
    finishTask: async () => ({ task: { id: 1, name: "finished task" } }),
    closeTask: async () => ({ task: { id: 1, name: "closed task" } }),
    ...(overrides ?? {}),
  } as unknown as ToolContext["apiClient"];

  return {
    apiClient,
    getApiClientForArgs: () => apiClient,
    config: {
      zentaoBaseUrl: "https://zentao.local",
      zentaoAccount: "admin",
      zentaoPassword: "pwd",
      zentaoTimeoutMs: 10000,
      zentaoTokenTtlMs: 100000,
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
      enableWriteTools: true,
    },
  };
}

describe("tasks tool", () => {
  it("returns INVALID_ARGUMENT for unsupported scope", async () => {
    const context = buildContext();
    const listTool = createTaskTools(context).find((tool) => tool.name === "zentao_list_tasks");
    assert.ok(listTool);

    const result = await listTool!.handler({
      scope: "product",
      scopeId: 10,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "INVALID_ARGUMENT");
  });

  it("filters and sorts mapped task list", async () => {
    const context = buildContext({
      listTasks: async () => ({
        data: {
          tasks: [
            { id: 1, name: "A", status: "done", assignedTo: "alice", consumed: 2 },
            { id: 2, name: "C", status: "doing", assignedTo: "alice", consumed: 1 },
            { id: 3, name: "B", status: "doing", assignedTo: "bob", consumed: 9 },
          ],
          pager: { recTotal: 99 },
        },
      }),
    });
    const listTool = createTaskTools(context).find((tool) => tool.name === "zentao_list_tasks");
    assert.ok(listTool);

    const result = await listTool.handler({
      scope: "execution",
      scopeId: 10,
      status: "doing",
      assignedTo: "alice",
      sortBy: "title",
      sortOrder: "desc",
    });

    assert.equal(result.ok, true);
    const payload = result.data as {
      items: Array<{ id: number; title: string }>;
      total: number;
      filteredTotal: number;
    };
    assert.equal(payload.total, 99);
    assert.equal(payload.filteredTotal, 1);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.id, 2);
  });

  it("returns project-scope guidance when project task endpoint is 404", async () => {
    const context = buildContext({
      listTasks: async () => {
        throw new ZenTaoApiError("UPSTREAM_ERROR", "禅道接口调用失败: HTTP 404", 404, {
          path: "/api.php/v1/projects/1/tasks",
        });
      },
    });
    const listTool = createTaskTools(context).find((tool) => tool.name === "zentao_list_tasks");
    assert.ok(listTool);

    const result = await listTool.handler({
      scope: "project",
      scopeId: 1,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "UPSTREAM_ERROR");
    assert.match(result.error?.message ?? "", /zentao_list_executions/);
  });

  it("maps create task payload", async () => {
    let capturedExecutionId = 0;
    let capturedPayload: Record<string, unknown> | undefined;
    const context = buildContext({
      createTask: async (executionId, payload) => {
        capturedExecutionId = executionId;
        capturedPayload = payload as unknown as Record<string, unknown>;
        return { task: { id: 11, name: "支付联调" } };
      },
    });
    const tool = createTaskTools(context).find((item) => item.name === "zentao_create_task");
    assert.ok(tool);

    const result = await tool.handler({
      executionId: 10,
      name: "支付联调",
      type: "devel",
      priority: 2,
      estimate: 8,
      assignedTo: "alice",
    });
    assert.equal(result.ok, true);
    assert.equal(capturedExecutionId, 10);
    assert.deepEqual(capturedPayload, {
      name: "支付联调",
      type: "devel",
      pri: 2,
      estimate: 8,
      assignedTo: "alice",
    });
  });

  it("validates update task requires at least one field", async () => {
    const context = buildContext();
    const tool = createTaskTools(context).find((item) => item.name === "zentao_update_task");
    assert.ok(tool);
    const result = await tool.handler({ taskId: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "INVALID_ARGUMENT");
  });

  it("maps task lifecycle action payloads", async () => {
    let startPayload: Record<string, unknown> | undefined;
    let pausePayload: Record<string, unknown> | undefined;
    let restartPayload: Record<string, unknown> | undefined;
    let finishPayload: Record<string, unknown> | undefined;
    let closePayload: Record<string, unknown> | undefined;
    const context = buildContext({
      startTask: async (_taskId, payload) => {
        startPayload = payload as unknown as Record<string, unknown>;
        return { task: { id: 1, name: "started" } };
      },
      pauseTask: async (_taskId, payload) => {
        pausePayload = payload as unknown as Record<string, unknown>;
        return { task: { id: 1, name: "paused" } };
      },
      restartTask: async (_taskId, payload) => {
        restartPayload = payload as unknown as Record<string, unknown>;
        return { task: { id: 1, name: "restart" } };
      },
      finishTask: async (_taskId, payload) => {
        finishPayload = payload as unknown as Record<string, unknown>;
        return { task: { id: 1, name: "finished" } };
      },
      closeTask: async (_taskId, payload) => {
        closePayload = payload as unknown as Record<string, unknown>;
        return { task: { id: 1, name: "closed" } };
      },
    });

    const startTool = createTaskTools(context).find((item) => item.name === "zentao_start_task");
    const pauseTool = createTaskTools(context).find((item) => item.name === "zentao_pause_task");
    const restartTool = createTaskTools(context).find((item) => item.name === "zentao_restart_task");
    const finishTool = createTaskTools(context).find((item) => item.name === "zentao_finish_task");
    const closeTool = createTaskTools(context).find((item) => item.name === "zentao_close_task");
    assert.ok(startTool);
    assert.ok(pauseTool);
    assert.ok(restartTool);
    assert.ok(finishTool);
    assert.ok(closeTool);

    assert.equal((await startTool.handler({ taskId: 1, consumed: 1.5, comment: "开始" })).ok, true);
    assert.equal((await pauseTool.handler({ taskId: 1, comment: "暂停" })).ok, true);
    assert.equal((await restartTool.handler({ taskId: 1, comment: "继续" })).ok, true);
    assert.equal((await finishTool.handler({ taskId: 1, consumed: 3, left: 0, comment: "完成" })).ok, true);
    assert.equal((await closeTool.handler({ taskId: 1, comment: "关闭" })).ok, true);

    assert.deepEqual(startPayload, { consumed: 1.5, comment: "开始" });
    assert.deepEqual(pausePayload, { comment: "暂停" });
    assert.deepEqual(restartPayload, { comment: "继续" });
    assert.deepEqual(finishPayload, { consumed: 3, left: 0, comment: "完成" });
    assert.deepEqual(closePayload, { comment: "关闭" });
  });
});
