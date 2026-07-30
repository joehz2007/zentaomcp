import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBuildTools } from "../../src/tools/builds.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

describe("builds tool", () => {
  it("lists builds by executionId and maps fields", async () => {
    let capturedExecutionId = 0;
    const apiClient = {
      listBuilds: async (executionId: number) => {
        capturedExecutionId = executionId;
        return {
          builds: [
            { id: 9, name: "trunk", date: "2026-07-01", builder: "admin", product: 1, project: 2, execution: 40 },
            { id: 10, name: "release-1.2", date: "2026-07-10", builder: "ci", product: 1, project: 2, execution: 40 },
          ],
          total: 2,
        };
      },
    } as unknown as ToolContext["apiClient"];

    const context: ToolContext = {
      apiClient,
      getApiClientForArgs: () => apiClient,
      sessionClient: {} as ToolContext["sessionClient"],
      getSessionClientForArgs: () => ({} as ToolContext["sessionClient"]),
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
        enableAttachmentTools: true,
        attachmentMaxBytes: 10_000,
      },
    };

    const tool = createBuildTools(context)[0];
    assert.ok(tool);
    const result = await tool.handler({ executionId: 40, keyword: "release", sortBy: "name" });
    assert.equal(result.ok, true);
    assert.equal(capturedExecutionId, 40);
    const payload = result.data as { filteredTotal: number; items: Array<{ name: string; productId?: number }> };
    assert.equal(payload.filteredTotal, 1);
    assert.equal(payload.items[0]?.name, "release-1.2");
    assert.equal(payload.items[0]?.productId, 1);
  });
});
