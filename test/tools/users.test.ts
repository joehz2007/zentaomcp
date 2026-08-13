import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUserTools } from "../../src/tools/users.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(): ToolContext {
  const apiClient = {
    listUsers: async () => ({
      users: [
        { id: 1, account: "admin", realname: "管理员", role: "" },
        { id: 2, account: "qa_alice", realname: "测试小艾", role: "qa" },
        { id: 3, account: "dev_bob", realname: "开发鲍勃", role: "dev" },
      ],
      total: 3,
    }),
  } as unknown as ToolContext["apiClient"];

  return {
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
}

describe("users tool", () => {
  it("filters users by keyword on realname/account", async () => {
    const tool = createUserTools(buildContext())[0];
    assert.ok(tool);
    const result = await tool.handler({ keyword: "测试", sortBy: "account" });
    assert.equal(result.ok, true);
    const payload = result.data as { filteredTotal: number; items: Array<{ account: string }> };
    assert.equal(payload.filteredTotal, 1);
    assert.equal(payload.items[0]?.account, "qa_alice");
  });
});
