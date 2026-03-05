import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolRegistry, type ToolContext } from "../../src/server/toolRegistry.js";
import { executeCallTool, listToolsResult } from "../../src/server/toolRuntime.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function buildContext(
  overrides?: Partial<ToolContext["apiClient"]>,
): ToolContext {
  const baseApiClient = {
    healthCheck: async () => ({ ok: true }),
    listProjects: async () => ({ projects: [] }),
    getProject: async () => ({}),
    listStories: async () => ({ stories: [] }),
    getStory: async () => ({}),
    listTasks: async () => ({ tasks: [] }),
    getTask: async () => ({}),
    createTask: async () => ({ task: { id: 1 } }),
    updateTask: async () => ({ task: { id: 1 } }),
    startTask: async () => ({ task: { id: 1 } }),
    pauseTask: async () => ({ task: { id: 1 } }),
    restartTask: async () => ({ task: { id: 1 } }),
    finishTask: async () => ({ task: { id: 1 } }),
    closeTask: async () => ({ task: { id: 1 } }),
    listBugs: async () => ({ bugs: [] }),
    getBug: async () => ({}),
    createBug: async () => ({ bug: { id: 1 } }),
    confirmBug: async () => ({ bug: { id: 1 } }),
    resolveBug: async () => ({ bug: { id: 1 } }),
    closeBug: async () => ({ bug: { id: 1 } }),
    activateBug: async () => ({ bug: { id: 1 } }),
  };

  const apiClient = { ...baseApiClient, ...(overrides ?? {}) } as unknown as ToolContext["apiClient"];
  const sessionClient = {
    downloadBinary: async () => ({
      sourcePath: "/file-download-1.html",
      content: new Uint8Array([1]),
      filename: "a.txt",
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

describe("tool runtime integration", () => {
  function readTextContent(response: CallToolResult): string {
    const block = response.content.find((item) => item.type === "text");
    return block && "text" in block ? block.text : "{}";
  }

  it("lists all tools", () => {
    const registry = new ToolRegistry(buildContext());
    const result = listToolsResult(registry);
    assert.equal(result.tools.length, 10);
  });

  it("lists write tools when enableWriteTools=true", () => {
    const context = buildContext();
    context.config.enableWriteTools = true;
    const registry = new ToolRegistry(context);
    const result = listToolsResult(registry);
    assert.equal(result.tools.length, 22);
  });

  it("lists attachment tools when enableAttachmentTools=true", () => {
    const context = buildContext({
      getStory: async () => ({ story: { id: 1, files: [] } }),
    });
    context.config.enableAttachmentTools = true;
    const registry = new ToolRegistry(context);
    const result = listToolsResult(registry);
    assert.equal(result.tools.length, 12);
  });

  it("runs call_tool for list_projects with filter and sort", async () => {
    const registry = new ToolRegistry(
      buildContext({
        listProjects: async () => ({
          data: {
            projects: [
              { id: 2, name: "Beta", status: "doing", PM: "alice" },
              { id: 1, name: "Alpha", status: "done", PM: "tom" },
              { id: 3, name: "Gamma", status: "doing", PM: "alice" },
            ],
            pager: { recTotal: 30 },
          },
        }),
      }),
    );

    const response = await executeCallTool(registry, "zentao_list_projects", {
      status: "doing",
      sortBy: "name",
      sortOrder: "desc",
    });

    assert.equal(response.isError, false);
    const result = JSON.parse(readTextContent(response)) as {
      ok: boolean;
      data: { items: Array<{ name: string }>; total: number; filteredTotal: number };
      meta: { total: number };
    };
    assert.equal(result.ok, true);
    assert.equal(result.data.total, 30);
    assert.equal(result.data.filteredTotal, 2);
    assert.deepEqual(result.data.items.map((item) => item.name), ["Gamma", "Beta"]);
    assert.equal(result.meta.total, 30);
  });

  it("returns INVALID_ARGUMENT for unknown tool", async () => {
    const registry = new ToolRegistry(buildContext());
    const response = await executeCallTool(registry, "unknown_tool", {});
    assert.equal(response.isError, true);
    const result = JSON.parse(readTextContent(response)) as {
      error?: { code?: string };
    };
    assert.equal(result.error?.code, "INVALID_ARGUMENT");
  });
});
