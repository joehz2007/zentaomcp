type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ?? {}),
  };
  // MCP stdio transport reserves stdout for protocol frames only.
  // Operational logs must go to stderr to avoid corrupting JSON-RPC messages.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
};
