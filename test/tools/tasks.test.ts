import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZenTaoApiError } from "../../src/domain/errors.js";
import { createTaskTools } from "../../src/tools/tasks.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(
  listTasksImpl: ToolContext["apiClient"]["listTasks"] = async () => ({ tasks: [] }),
): ToolContext {
  return {
    apiClient: {
      listTasks: listTasksImpl,
      getTask: async () => {
        throw new Error("should not be called");
      },
    } as unknown as ToolContext["apiClient"],
    getApiClientForArgs: () =>
      ({
        listTasks: listTasksImpl,
        getTask: async () => {
          throw new Error("should not be called");
        },
      }) as unknown as ToolContext["apiClient"],
    config: {
      zentaoBaseUrl: "https://zentao.local",
      zentaoAccount: "admin",
      zentaoPassword: "pwd",
      zentaoTimeoutMs: 10000,
      zentaoTokenTtlMs: 100000,
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
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
    const context = buildContext(async () => ({
      data: {
        tasks: [
          { id: 1, name: "A", status: "done", assignedTo: "alice", consumed: 2 },
          { id: 2, name: "C", status: "doing", assignedTo: "alice", consumed: 1 },
          { id: 3, name: "B", status: "doing", assignedTo: "bob", consumed: 9 },
        ],
        pager: { recTotal: 99 },
      },
    }));
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
    const context = buildContext(async () => {
      throw new ZenTaoApiError("UPSTREAM_ERROR", "禅道接口调用失败: HTTP 404", 404, {
        path: "/api.php/v1/projects/1/tasks",
      });
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
});
