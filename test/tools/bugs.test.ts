import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBugTools } from "../../src/tools/bugs.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(overrides?: Partial<ToolContext["apiClient"]>): ToolContext {
  const apiClient = {
    listBugs: async () => ({ bugs: [] }),
    getBug: async () => ({}),
    createBug: async () => ({ bug: { id: 1, title: "new bug" } }),
    confirmBug: async () => ({ bug: { id: 1, title: "assigned bug" } }),
    resolveBug: async () => ({ bug: { id: 1, title: "resolved bug" } }),
    closeBug: async () => ({ bug: { id: 1, title: "closed bug" } }),
    activateBug: async () => ({ bug: { id: 1, title: "activated bug" } }),
    ...(overrides ?? {}),
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
      enableWriteTools: true,
      enableAttachmentTools: false,
      attachmentMaxBytes: 5 * 1024 * 1024,
    },
  };
}

describe("bugs tool", () => {
  it("returns INVALID_ARGUMENT when create bug title is empty", async () => {
    const context = buildContext();
    const createTool = createBugTools(context).find((tool) => tool.name === "zentao_create_bug");
    assert.ok(createTool);

    const result = await createTool.handler({
      productId: 12,
      title: "   ",
      severity: 2,
      priority: 3,
      type: "codeerror",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "INVALID_ARGUMENT");
    assert.match(result.error?.message ?? "", /title/);
  });

  it("maps create bug args and returns mapped bug detail", async () => {
    let capturedProductId = 0;
    let capturedPayload: Record<string, unknown> | undefined;
    const context = buildContext({
      createBug: async (productId, payload) => {
        capturedProductId = productId;
        capturedPayload = payload as unknown as Record<string, unknown>;
        return {
          bug: {
            id: 1001,
            title: "支付失败",
            severity: 2,
            pri: 1,
            assignedTo: { account: "alice" },
            openedBy: { account: "tom" },
          },
        };
      },
    });
    const createTool = createBugTools(context).find((tool) => tool.name === "zentao_create_bug");
    assert.ok(createTool);

    const result = await createTool.handler({
      productId: 12,
      title: "支付失败",
      severity: 2,
      priority: 1,
      type: "codeerror",
      steps: "复现步骤",
      openedBuild: ["trunk", 100],
      project: 90,
    });

    assert.equal(result.ok, true);
    assert.equal(capturedProductId, 12);
    assert.deepEqual(capturedPayload, {
      title: "支付失败",
      severity: 2,
      pri: 1,
      type: "codeerror",
      steps: "复现步骤",
      openedBuild: ["trunk", "100"],
      project: 90,
    });

    const data = result.data as { item: { id: number; title: string; priority?: string } };
    assert.equal(data.item.id, 1001);
    assert.equal(data.item.title, "支付失败");
    assert.equal(data.item.priority, "1");
  });

  it("maps assign tool args to confirm payload", async () => {
    let capturedBugId = 0;
    let capturedPayload: Record<string, unknown> | undefined;
    const context = buildContext({
      confirmBug: async (bugId, payload) => {
        capturedBugId = bugId;
        capturedPayload = payload as unknown as Record<string, unknown>;
        return { bug: { id: bugId, title: "assigned" } };
      },
    });
    const tool = createBugTools(context).find((item) => item.name === "zentao_assign_bug");
    assert.ok(tool);

    const result = await tool.handler({
      bugId: 88,
      assignedTo: "alice",
      comment: "请处理",
      priority: 2,
      type: "codeerror",
      mailto: ["tom"],
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBugId, 88);
    assert.deepEqual(capturedPayload, {
      assignedTo: "alice",
      comment: "请处理",
      pri: 2,
      type: "codeerror",
      mailto: ["tom"],
    });
  });

  it("maps resolve/close/activate payloads", async () => {
    let resolvePayload: Record<string, unknown> | undefined;
    let closePayload: Record<string, unknown> | undefined;
    let activatePayload: Record<string, unknown> | undefined;
    const context = buildContext({
      resolveBug: async (_bugId, payload) => {
        resolvePayload = payload as unknown as Record<string, unknown>;
        return { bug: { id: 1, title: "resolved" } };
      },
      closeBug: async (_bugId, payload) => {
        closePayload = payload as unknown as Record<string, unknown>;
        return { bug: { id: 1, title: "closed" } };
      },
      activateBug: async (_bugId, payload) => {
        activatePayload = payload as unknown as Record<string, unknown>;
        return { bug: { id: 1, title: "active" } };
      },
    });
    const resolveTool = createBugTools(context).find((item) => item.name === "zentao_resolve_bug");
    const closeTool = createBugTools(context).find((item) => item.name === "zentao_close_bug");
    const activateTool = createBugTools(context).find((item) => item.name === "zentao_activate_bug");
    assert.ok(resolveTool);
    assert.ok(closeTool);
    assert.ok(activateTool);

    const resolveResult = await resolveTool.handler({
      bugId: 1,
      resolution: "duplicate",
      resolvedBuild: "trunk",
      duplicateBug: 2,
      assignedTo: "alice",
      comment: "重复单",
      mailto: ["tom"],
    });
    assert.equal(resolveResult.ok, true);

    const closeResult = await closeTool.handler({
      bugId: 1,
      comment: "验证通过",
    });
    assert.equal(closeResult.ok, true);

    const activateResult = await activateTool.handler({
      bugId: 1,
      assignedTo: "bob",
      comment: "复测失败",
    });
    assert.equal(activateResult.ok, true);

    assert.deepEqual(resolvePayload, {
      resolution: "duplicate",
      resolvedBuild: "trunk",
      duplicateBug: 2,
      assignedTo: "alice",
      comment: "重复单",
      mailto: ["tom"],
    });
    assert.deepEqual(closePayload, { comment: "验证通过" });
    assert.deepEqual(activatePayload, { assignedTo: "bob", comment: "复测失败" });
  });
});
