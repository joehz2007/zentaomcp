import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZenTaoApiError } from "../../src/domain/errors.js";
import type { AppConfig } from "../../src/infra/config.js";
import { createApiClientResolver, resolveAuthOverride } from "../../src/server/authOverride.js";
import type { ZenTaoApiClient } from "../../src/zentao/apiClient.js";

describe("auth override", () => {
  it("returns null when no override args are provided", () => {
    const result = resolveAuthOverride({});
    assert.equal(result, null);
  });

  it("throws INVALID_ARGUMENT when override is partial", () => {
    assert.throws(
      () => resolveAuthOverride({ baseUrl: "https://zentao.local", account: "alice" }),
      (error: unknown) =>
        error instanceof ZenTaoApiError &&
        error.code === "INVALID_ARGUMENT" &&
        /baseUrl\/account\/password/.test(error.message),
    );
  });

  it("creates and caches apiClient for full override credentials", () => {
    const defaultClient = { marker: "default" } as unknown as ZenTaoApiClient;
    const config: AppConfig = {
      zentaoBaseUrl: "https://default.local",
      zentaoAccount: "default",
      zentaoPassword: "default",
      zentaoTimeoutMs: 10000,
      zentaoTokenTtlMs: 600000,
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
      enableWriteTools: false,
    };

    const resolver = createApiClientResolver(defaultClient, config);

    const noOverride = resolver({});
    assert.equal(noOverride, defaultClient);

    const client1 = resolver({
      baseUrl: "https://zentao.a.local",
      account: "alice",
      password: "pwd",
    });
    const client2 = resolver({
      baseUrl: "https://zentao.a.local",
      account: "alice",
      password: "pwd",
    });

    assert.notEqual(client1, defaultClient);
    assert.equal(client1, client2);
  });
});
