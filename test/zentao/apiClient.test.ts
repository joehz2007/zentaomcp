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
});
