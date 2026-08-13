import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProductTools } from "../../src/tools/products.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(overrides?: Partial<ToolContext["apiClient"]>): ToolContext {
  const apiClient = {
    listProducts: async () => ({
      products: [
        { id: 2, name: "支付", code: "pay", status: "normal", PO: { account: "po1" } },
        { id: 1, name: "商城", code: "mall", status: "closed", PO: "po2" },
      ],
      total: 2,
    }),
    getProduct: async () => ({
      product: { id: 2, name: "支付", code: "pay", status: "normal", PO: "po1", QD: "qa1", RD: "rd1" },
    }),
    ...(overrides ?? {}),
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

describe("products tool", () => {
  it("lists and filters products", async () => {
    const tool = createProductTools(buildContext()).find((item) => item.name === "zentao_list_products");
    assert.ok(tool);
    const result = await tool.handler({ status: "normal", sortBy: "name" });
    assert.equal(result.ok, true);
    const payload = result.data as { filteredTotal: number; items: Array<{ name: string }> };
    assert.equal(payload.filteredTotal, 1);
    assert.equal(payload.items[0]?.name, "支付");
  });

  it("gets product detail", async () => {
    const tool = createProductTools(buildContext()).find((item) => item.name === "zentao_get_product");
    assert.ok(tool);
    const result = await tool.handler({ productId: 2 });
    assert.equal(result.ok, true);
    const payload = result.data as { item: { id: number; qd?: string } };
    assert.equal(payload.item?.id, 2);
    assert.equal(payload.item?.qd, "qa1");
  });
});
