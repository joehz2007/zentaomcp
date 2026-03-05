import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createExecutionTools } from "../../src/tools/executions.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(): ToolContext {
  const apiClient = {
    listExecutions: async () => ({
      data: {
        executions: [
          { id: 2, name: "执行B", status: "doing", project: 1, PM: "alice" },
          { id: 1, name: "执行A", status: "wait", project: 1, PM: "tom" },
        ],
        pager: { recTotal: 12 },
      },
    }),
  } as unknown as ToolContext["apiClient"];
  const sessionClient = {
    downloadBinary: async () => ({
      sourcePath: "/file-download-1.html",
      content: new Uint8Array([1]),
    }),
  } as unknown as ToolContext["sessionClient"];

  return {
    apiClient,
    getApiClientForArgs: () => apiClient,
    sessionClient,
    getSessionClientForArgs: () => sessionClient,
    config: {
      zentaoBaseUrl: "https://zentao.local",
      zentaoAccount: "admin",
      zentaoPassword: "pwd",
      zentaoTimeoutMs: 10000,
      zentaoTokenTtlMs: 100000,
      zentaoSessionTtlMs: 100000,
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
      enableWriteTools: false,
      enableAttachmentTools: false,
      attachmentMaxBytes: 5 * 1024 * 1024,
    },
  };
}

describe("executions tool", () => {
  it("lists executions with mapping and sorting", async () => {
    const context = buildContext();
    const listTool = createExecutionTools(context).find((tool) => tool.name === "zentao_list_executions");
    assert.ok(listTool);

    const result = await listTool.handler({
      projectId: 1,
      sortBy: "id",
      sortOrder: "asc",
    });

    assert.equal(result.ok, true);
    const payload = result.data as {
      items: Array<{ id: number; name: string }>;
      total: number;
      filteredTotal: number;
    };
    assert.equal(payload.total, 12);
    assert.equal(payload.filteredTotal, 2);
    assert.deepEqual(payload.items.map((item) => item.id), [1, 2]);
  });
});
