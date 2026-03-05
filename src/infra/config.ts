function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() ? value.trim() : undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = readEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readEnv(name);
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export interface AppConfig {
  zentaoBaseUrl: string;
  zentaoAccount: string;
  zentaoPassword: string;
  zentaoTimeoutMs: number;
  zentaoTokenTtlMs: number;
  zentaoSessionTtlMs: number;
  defaultPage: number;
  defaultLimit: number;
  maxLimit: number;
  enableWriteTools: boolean;
  enableAttachmentTools: boolean;
  attachmentMaxBytes: number;
}

export function loadConfig(): AppConfig {
  return {
    zentaoBaseUrl: readEnv("ZENTAO_BASE_URL") ?? "",
    zentaoAccount: readEnv("ZENTAO_ACCOUNT") ?? "",
    zentaoPassword: readEnv("ZENTAO_PASSWORD") ?? "",
    zentaoTimeoutMs: readNumberEnv("ZENTAO_TIMEOUT_MS", 10_000),
    zentaoTokenTtlMs: readNumberEnv("ZENTAO_TOKEN_TTL_MS", 3_000_000),
    zentaoSessionTtlMs: readNumberEnv("ZENTAO_SESSION_TTL_MS", 3_000_000),
    defaultPage: readNumberEnv("MCP_DEFAULT_PAGE", 1),
    defaultLimit: readNumberEnv("MCP_DEFAULT_LIMIT", 20),
    maxLimit: readNumberEnv("MCP_MAX_LIMIT", 100),
    enableWriteTools: readBooleanEnv("MCP_ENABLE_WRITE_TOOLS", false),
    enableAttachmentTools: readBooleanEnv("MCP_ENABLE_ATTACHMENT_TOOLS", false),
    attachmentMaxBytes: readNumberEnv("MCP_ATTACHMENT_MAX_BYTES", 5 * 1024 * 1024),
  };
}
