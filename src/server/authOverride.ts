import { ZenTaoApiError } from "../domain/errors.js";
import type { AppConfig } from "../infra/config.js";
import { ZenTaoApiClient } from "../zentao/apiClient.js";
import { ZenTaoAuthClient } from "../zentao/authClient.js";

interface AuthOverride {
  baseUrl: string;
  account: string;
  password: string;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function resolveAuthOverride(args: Record<string, unknown>): AuthOverride | null {
  const baseUrl = readOptionalString(args.baseUrl);
  const account = readOptionalString(args.account);
  const password = readOptionalString(args.password);
  const hasAny = Boolean(baseUrl || account || password);
  if (!hasAny) return null;
  if (!baseUrl || !account || !password) {
    throw new ZenTaoApiError(
      "INVALID_ARGUMENT",
      "若使用个人账号，请同时提供 baseUrl/account/password",
    );
  }
  return { baseUrl, account, password };
}

export function createApiClientResolver(
  defaultClient: ZenTaoApiClient,
  config: AppConfig,
): (args: Record<string, unknown>) => ZenTaoApiClient {
  const cache = new Map<string, ZenTaoApiClient>();

  return (args: Record<string, unknown>) => {
    const override = resolveAuthOverride(args);
    if (!override) return defaultClient;

    const key = `${override.baseUrl}::${override.account}::${override.password}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const authClient = new ZenTaoAuthClient({
      baseUrl: override.baseUrl,
      account: override.account,
      password: override.password,
      timeoutMs: config.zentaoTimeoutMs,
      tokenTtlMs: config.zentaoTokenTtlMs,
    });
    const apiClient = new ZenTaoApiClient(override.baseUrl, config.zentaoTimeoutMs, authClient);
    cache.set(key, apiClient);
    return apiClient;
  };
}
