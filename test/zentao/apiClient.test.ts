import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZenTaoApiClient } from "../../src/zentao/apiClient.js";

describe("ZenTaoApiClient", () => {
  it("routes listTasks(execution) to executions endpoint", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | globalThis.Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ tasks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const authCalls: boolean[] = [];
    const authClient = {
      getToken: async (forceRefresh = false) => {
        authCalls.push(forceRefresh);
        return "token_1";
      },
    };
    try {
      const client = new ZenTaoApiClient(
        "https://zentao.local",
        10_000,
        authClient as never,
      );
      await client.listTasks("execution", 88, { page: 2, limit: 30 });

      assert.equal(fetchCalls.length, 1);
      assert.equal(
        fetchCalls[0]?.url,
        "https://zentao.local/api.php/v1/executions/88/tasks?page=2&limit=30",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries once after 401", async () => {
    const originalFetch = globalThis.fetch;
    let hit = 0;
    globalThis.fetch = (async () => {
      hit += 1;
      if (hit === 1) {
        return new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: 1, name: "P1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const authCalls: boolean[] = [];
    const authClient = {
      getToken: async (forceRefresh = false) => {
        authCalls.push(forceRefresh);
        return "token_retry";
      },
    };
    try {
      const client = new ZenTaoApiClient(
        "https://zentao.local",
        10_000,
        authClient as never,
      );
      const result = await client.getProject(1);

      assert.deepEqual(result, { id: 1, name: "P1" });
      assert.equal(hit, 2);
      assert.deepEqual(authCalls, [false, true, true]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("posts createBug payload to product bugs endpoint", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | globalThis.Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ bug: { id: 9, title: "bug" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const authClient = {
      getToken: async () => "token_create",
    };
    try {
      const client = new ZenTaoApiClient(
        "https://zentao.local",
        10_000,
        authClient as never,
      );
      await client.createBug(12, {
        title: "新 Bug",
        severity: 2,
        pri: 1,
        type: "codeerror",
        openedBuild: ["trunk"],
      });

      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0]?.url, "https://zentao.local/api.php/v1/products/12/bugs");
      assert.equal(fetchCalls[0]?.init?.method, "POST");
      assert.equal(fetchCalls[0]?.init?.headers && (fetchCalls[0]?.init?.headers as Record<string, string>).Token, "token_create");
      assert.equal(fetchCalls[0]?.init?.body, JSON.stringify({
        title: "新 Bug",
        severity: 2,
        pri: 1,
        type: "codeerror",
        openedBuild: ["trunk"],
      }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("posts bug action payloads to action endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | globalThis.Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ bug: { id: 9 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const authClient = {
      getToken: async () => "token_actions",
    };
    try {
      const client = new ZenTaoApiClient(
        "https://zentao.local",
        10_000,
        authClient as never,
      );

      await client.confirmBug(9, { assignedTo: "alice", comment: "处理一下" });
      await client.resolveBug(9, { resolution: "fixed", comment: "已修复" });
      await client.closeBug(9, { comment: "已验收" });
      await client.activateBug(9, { assignedTo: "bob", comment: "复测失败" });

      assert.equal(fetchCalls.length, 4);
      assert.deepEqual(fetchCalls.map((call) => call.url), [
        "https://zentao.local/api.php/v1/bugs/9/confirm",
        "https://zentao.local/api.php/v1/bugs/9/resolve",
        "https://zentao.local/api.php/v1/bugs/9/close",
        "https://zentao.local/api.php/v1/bugs/9/active",
      ]);
      assert.deepEqual(fetchCalls.map((call) => call.init?.method), ["POST", "POST", "POST", "POST"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("calls task write endpoints with expected methods", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | globalThis.Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ task: { id: 7 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const authClient = {
      getToken: async () => "token_task_actions",
    };
    try {
      const client = new ZenTaoApiClient(
        "https://zentao.local",
        10_000,
        authClient as never,
      );

      await client.createTask(88, { name: "联调任务", type: "devel", pri: 2 });
      await client.updateTask(7, { name: "联调任务v2" });
      await client.startTask(7, { consumed: 1, comment: "开始" });
      await client.pauseTask(7, { comment: "暂停" });
      await client.restartTask(7, { comment: "继续" });
      await client.finishTask(7, { consumed: 5, left: 0, comment: "完成" });
      await client.closeTask(7, { comment: "关闭" });

      assert.equal(fetchCalls.length, 7);
      assert.deepEqual(fetchCalls.map((call) => call.url), [
        "https://zentao.local/api.php/v1/executions/88/tasks",
        "https://zentao.local/api.php/v1/tasks/7",
        "https://zentao.local/api.php/v1/tasks/7/start",
        "https://zentao.local/api.php/v1/tasks/7/pause",
        "https://zentao.local/api.php/v1/tasks/7/restart",
        "https://zentao.local/api.php/v1/tasks/7/finish",
        "https://zentao.local/api.php/v1/tasks/7/close",
      ]);
      assert.deepEqual(fetchCalls.map((call) => call.init?.method), ["POST", "PUT", "POST", "POST", "POST", "POST", "POST"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
