import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZenTaoApiError } from "../../src/domain/errors.js";
import { ZenTaoSessionAuthClient } from "../../src/zentao/sessionAuthClient.js";

describe("ZenTaoSessionAuthClient", () => {
  it("creates and caches session cookie", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL | globalThis.Request) => {
      const target = String(url);
      calls.push(target);
      if (target.endsWith("/api-getsessionid.json")) {
        return new Response(JSON.stringify({ sessionID: "sid_1" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "set-cookie": "zentaosid=sid_cookie; Path=/; HttpOnly",
          },
        });
      }
      return new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "set-cookie": "zentaosid=sid_logged; Path=/; HttpOnly",
        },
      });
    }) as typeof fetch;

    try {
      const client = new ZenTaoSessionAuthClient({
        baseUrl: "https://zentao.local",
        account: "admin",
        password: "pwd",
        timeoutMs: 10000,
        sessionTtlMs: 100000,
      });
      const cookie1 = await client.getCookie();
      const cookie2 = await client.getCookie();
      assert.equal(cookie1, "zentaosid=sid_logged");
      assert.equal(cookie2, "zentaosid=sid_logged");
      assert.equal(calls.length, 2);
      assert.equal(calls[0], "https://zentao.local/api-getsessionid.json");
      assert.equal(calls[1], "https://zentao.local/user-login.json");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws AUTH_FAILED when login payload indicates failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | globalThis.Request) => {
      const target = String(url);
      if (target.endsWith("/api-getsessionid.json")) {
        return new Response(JSON.stringify({ sessionID: "sid_1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ status: "fail", message: "invalid" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const client = new ZenTaoSessionAuthClient({
        baseUrl: "https://zentao.local",
        account: "admin",
        password: "bad",
        timeoutMs: 10000,
        sessionTtlMs: 100000,
      });
      await assert.rejects(
        () => client.getCookie(),
        (error: unknown) =>
          error instanceof ZenTaoApiError && error.code === "AUTH_FAILED",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
