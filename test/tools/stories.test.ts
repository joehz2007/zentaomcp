import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStoryTools } from "../../src/tools/stories.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(
  overrides?: Partial<ToolContext["apiClient"]>,
): ToolContext {
  const apiClient = {
    listStories: async () => ({ stories: [] }),
    getStory: async () => ({ story: { id: 1 } }),
    createStory: async () => ({ story: { id: 1, title: "new" } }),
    ...(overrides ?? {}),
  } as unknown as ToolContext["apiClient"];
  const sessionClient = {
    downloadBinary: async () => ({
      sourcePath: "/x",
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

describe("stories create tool", () => {
  it("maps create story payload with reviewer array and numeric branch", async () => {
    let capturedProductId = 0;
    let capturedPayload: Record<string, unknown> | undefined;
    const context = buildContext({
      createStory: async (productId, payload) => {
        capturedProductId = productId;
        capturedPayload = payload as unknown as Record<string, unknown>;
        return { story: { id: 9001, title: payload.title } };
      },
    });
    const tool = createStoryTools(context).find((item) => item.name === "zentao_create_story");
    assert.ok(tool);

    const result = await tool.handler({
      productId: 77,
      title: "MCP 验收需求",
      spec: "验收 create story",
      verify: "ok",
      reviewer: ["moomesy.liang"],
      pri: 2,
      category: "feature",
      branch: 0,
      assignedTo: "moomesy.liang",
    });

    assert.equal(result.ok, true);
    assert.equal(capturedProductId, 77);
    assert.deepEqual(capturedPayload, {
      title: "MCP 验收需求",
      spec: "验收 create story",
      verify: "ok",
      reviewer: ["moomesy.liang"],
      pri: 2,
      category: "feature",
      branch: 0,
      assignedTo: "moomesy.liang",
    });
  });

  it("rejects string reviewer", async () => {
    const context = buildContext();
    const tool = createStoryTools(context).find((item) => item.name === "zentao_create_story");
    assert.ok(tool);
    const result = await tool.handler({
      productId: 77,
      title: "x",
      spec: "y",
      reviewer: "moomesy.liang",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "INVALID_ARGUMENT");
    assert.match(result.error?.message ?? "", /string\[\]/);
  });
});
