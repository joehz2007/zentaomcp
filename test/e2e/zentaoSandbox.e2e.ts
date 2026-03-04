import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type AppConfig, loadConfig } from "../../src/infra/config.js";
import { executeCallTool } from "../../src/server/toolRuntime.js";
import { ToolRegistry } from "../../src/server/toolRegistry.js";
import { createApiClientResolver } from "../../src/server/authOverride.js";
import { ZenTaoApiClient } from "../../src/zentao/apiClient.js";
import { ZenTaoAuthClient } from "../../src/zentao/authClient.js";

type ToolResult = {
  ok: boolean;
  data: unknown;
  error?: { code?: string; message?: string };
};

const isE2EEnabled = process.env.ZENTAO_E2E === "1";
const runBugLifecycle = process.env.ZENTAO_E2E_BUG_LIFECYCLE === "1";
const runTaskLifecycle = process.env.ZENTAO_E2E_TASK_LIFECYCLE === "1";
const runId = `AUTO-E2E-${Date.now()}`;

function readRequiredPositiveIntEnv(name: string): number {
  const raw = process.env[name]?.trim();
  assert.ok(raw, `缺少环境变量 ${name}`);
  const parsed = Number(raw);
  assert.ok(Number.isInteger(parsed) && parsed > 0, `环境变量 ${name} 必须是正整数`);
  return parsed;
}

function parseCallToolResult(response: CallToolResult): ToolResult {
  const block = response.content.find((item) => item.type === "text");
  const rawText = block && "text" in block ? block.text : "{}";
  return JSON.parse(rawText) as ToolResult;
}

async function callTool(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const response = await executeCallTool(registry, name, args);
  const result = parseCallToolResult(response);
  if (!result.ok) {
    const errorCode = result.error?.code ?? "UNKNOWN";
    const errorMessage = result.error?.message ?? "未知错误";
    assert.fail(`[${name}] 调用失败: ${errorCode} ${errorMessage}`);
  }
  return result;
}

describe("zentao sandbox e2e", { skip: !isE2EEnabled }, () => {
  let registry: ToolRegistry;
  let config: AppConfig;
  let productId = 0;
  let executionId = 0;
  let assignedTo: string | undefined;

  before(() => {
    config = { ...loadConfig(), enableWriteTools: true };
    assert.ok(config.zentaoBaseUrl, "缺少 ZENTAO_BASE_URL");
    assert.ok(config.zentaoAccount, "缺少 ZENTAO_ACCOUNT");
    assert.ok(config.zentaoPassword, "缺少 ZENTAO_PASSWORD");

    productId = readRequiredPositiveIntEnv("ZENTAO_E2E_PRODUCT_ID");
    executionId = readRequiredPositiveIntEnv("ZENTAO_E2E_EXECUTION_ID");
    assignedTo = process.env.ZENTAO_E2E_ASSIGNED_TO?.trim() || undefined;

    const authClient = new ZenTaoAuthClient({
      baseUrl: config.zentaoBaseUrl,
      account: config.zentaoAccount,
      password: config.zentaoPassword,
      timeoutMs: config.zentaoTimeoutMs,
      tokenTtlMs: config.zentaoTokenTtlMs,
    });
    const apiClient = new ZenTaoApiClient(config.zentaoBaseUrl, config.zentaoTimeoutMs, authClient);
    const getApiClientForArgs = createApiClientResolver(apiClient, config);
    registry = new ToolRegistry({ apiClient, getApiClientForArgs, config });
  });

  it("checks sandbox connectivity and authentication", async () => {
    const result = await callTool(registry, "zentao_health_check", { verifyAuth: true });
    assert.equal(result.ok, true);
  });

  it("creates a bug in sandbox and verifies detail query", async () => {
    const title = `${runId} bug`;
    const createResult = await callTool(registry, "zentao_create_bug", {
      productId,
      title,
      severity: 3,
      priority: 3,
      type: "codeerror",
      steps: `Created by ${runId}`,
      openedBuild: ["trunk"],
    });

    const createdBugId = Number((createResult.data as { item?: { id?: number } })?.item?.id);
    assert.ok(Number.isInteger(createdBugId) && createdBugId > 0, "创建 Bug 后未返回有效 bugId");

    const detailResult = await callTool(registry, "zentao_get_bug", { bugId: createdBugId });
    const queriedBugId = Number((detailResult.data as { item?: { id?: number } })?.item?.id);
    assert.equal(queriedBugId, createdBugId);

    if (!runBugLifecycle) return;
    assert.ok(assignedTo, "开启 ZENTAO_E2E_BUG_LIFECYCLE=1 时必须设置 ZENTAO_E2E_ASSIGNED_TO");

    await callTool(registry, "zentao_assign_bug", {
      bugId: createdBugId,
      assignedTo,
      comment: `${runId} assign`,
    });
    await callTool(registry, "zentao_resolve_bug", {
      bugId: createdBugId,
      resolution: "fixed",
      comment: `${runId} resolve`,
    });
    await callTool(registry, "zentao_close_bug", {
      bugId: createdBugId,
      comment: `${runId} close`,
    });
    await callTool(registry, "zentao_activate_bug", {
      bugId: createdBugId,
      assignedTo,
      comment: `${runId} activate`,
    });
  });

  it("creates and updates a task in sandbox", async () => {
    const taskName = `${runId} task`;
    const createArgs: Record<string, unknown> = {
      executionId,
      name: taskName,
      type: "devel",
      priority: 3,
      estimate: 1,
    };
    if (assignedTo) createArgs.assignedTo = assignedTo;

    const createResult = await callTool(registry, "zentao_create_task", createArgs);
    const createdTaskId = Number((createResult.data as { item?: { id?: number } })?.item?.id);
    assert.ok(Number.isInteger(createdTaskId) && createdTaskId > 0, "创建任务后未返回有效 taskId");

    const getResult = await callTool(registry, "zentao_get_task", { taskId: createdTaskId });
    const queriedTaskId = Number((getResult.data as { item?: { id?: number } })?.item?.id);
    assert.equal(queriedTaskId, createdTaskId);

    await callTool(registry, "zentao_update_task", {
      taskId: createdTaskId,
      name: `${taskName} updated`,
    });

    if (!runTaskLifecycle) return;

    await callTool(registry, "zentao_start_task", {
      taskId: createdTaskId,
      consumed: 0.5,
      comment: `${runId} start`,
    });
    await callTool(registry, "zentao_pause_task", {
      taskId: createdTaskId,
      comment: `${runId} pause`,
    });
    await callTool(registry, "zentao_restart_task", {
      taskId: createdTaskId,
      comment: `${runId} restart`,
    });
    await callTool(registry, "zentao_finish_task", {
      taskId: createdTaskId,
      consumed: 1,
      left: 0,
      comment: `${runId} finish`,
    });
    await callTool(registry, "zentao_close_task", {
      taskId: createdTaskId,
      comment: `${runId} close`,
    });
  });
});
