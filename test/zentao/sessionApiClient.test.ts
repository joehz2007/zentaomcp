import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZenTaoApiError } from "../../src/domain/errors.js";
import { ZenTaoSessionApiClient, normalizeDownloadPath } from "../../src/zentao/sessionApiClient.js";

describe("ZenTaoSessionApiClient", () => {
  it("downloads binary with cookie header", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | globalThis.Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "content-disposition": "attachment; filename=\"a.pdf\"",
        },
      });
    }) as typeof fetch;

    try {
      const authClient = {
        getCookie: async () => "zentaosid=sid_1",
      };
      const client = new ZenTaoSessionApiClient(
        "https://zentao.local",
        10000,
        authClient as never,
      );

      const result = await client.downloadBinary("/file-download-11.html", 1000);
      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0]?.url, "https://zentao.local/file-download-11.html");
      assert.equal(
        (fetchCalls[0]?.init?.headers as Record<string, string>).Cookie,
        "zentaosid=sid_1",
      );
      assert.equal(result.filename, "a.pdf");
      assert.equal(result.content.byteLength, 3);
      assert.equal(result.contentType, "application/pdf");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws INVALID_ARGUMENT when content is larger than maxBytes", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    }) as typeof fetch;

    try {
      const authClient = {
        getCookie: async () => "zentaosid=sid_1",
      };
      const client = new ZenTaoSessionApiClient(
        "https://zentao.local",
        10000,
        authClient as never,
      );
      await assert.rejects(
        () => client.downloadBinary("/file-download-11.html", 3),
        (error: unknown) =>
          error instanceof ZenTaoApiError && error.code === "INVALID_ARGUMENT",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes path and rejects cross-origin url", () => {
    assert.equal(
      normalizeDownloadPath("https://zentao.local/file-download-1.html?a=1", "https://zentao.local"),
      "/file-download-1.html?a=1",
    );
    assert.throws(
      () => normalizeDownloadPath("https://evil.local/file-download-1.html", "https://zentao.local"),
      (error: unknown) =>
        error instanceof ZenTaoApiError && error.code === "INVALID_ARGUMENT",
    );
  });
});
