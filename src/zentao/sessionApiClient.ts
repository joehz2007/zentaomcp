import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { ZenTaoApiError, toErrorCode } from "../domain/errors.js";
import type { ZenTaoSessionAuthClient } from "./sessionAuthClient.js";
import type { FormFieldValue } from "./editFormFields.js";

export interface DownloadBinaryResult {
  sourcePath: string;
  content: Uint8Array;
  contentType?: string;
  filename?: string;
}

export interface UploadFileInput {
  /** 本地绝对/相对路径，由 MCP 进程读取 */
  filePath: string;
  /** multipart 字段名，默认 files[] */
  fieldName?: string;
  filename?: string;
  contentType?: string;
}

export interface SessionFormResult {
  path: string;
  status: number;
  payload: unknown;
  rawText?: string;
}

export class ZenTaoSessionApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly authClient: ZenTaoSessionAuthClient;

  constructor(baseUrl: string, timeoutMs: number, authClient: ZenTaoSessionAuthClient) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.authClient = authClient;
  }

  async downloadBinary(path: string, maxBytes: number): Promise<DownloadBinaryResult> {
    return this.requestDownload(path, maxBytes);
  }

  /** multipart 提交（任务/需求 edit 上传附件） */
  async postMultipart(
    path: string,
    fields: Record<string, FormFieldValue>,
    file: UploadFileInput,
  ): Promise<SessionFormResult> {
    const absolutePath = resolveLocalFilePath(file.filePath);
    const bytes = await readFile(absolutePath);
    const filename = file.filename ?? nodePath.basename(absolutePath);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      form.append(key, String(value));
    }
    const blob = new Blob([bytes], {
      type: file.contentType ?? guessContentType(filename),
    });
    form.append(file.fieldName ?? "files[]", blob, filename);
    return this.requestForm("POST", path, form);
  }

  /** application/x-www-form-urlencoded（记工等） */
  async postFormUrlEncoded(
    path: string,
    fields: Record<string, FormFieldValue>,
  ): Promise<SessionFormResult> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      body.set(key, String(value));
    }
    return this.requestForm(
      "POST",
      path,
      body.toString(),
      { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    );
  }

  /** GET 确认类页面（如 deleteEstimate-yes） */
  async getSession(path: string): Promise<SessionFormResult> {
    return this.requestForm("GET", path);
  }

  private async requestDownload(
    path: string,
    maxBytes: number,
    hasRetriedAuth = false,
  ): Promise<DownloadBinaryResult> {
    const sourcePath = normalizeDownloadPath(path, this.baseUrl);
    const cookie = await this.authClient.getCookie(hasRetriedAuth);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${sourcePath}`, {
        method: "GET",
        headers: {
          Cookie: cookie,
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if ((response.status === 401 || response.status === 403) && !hasRetriedAuth) {
        await this.authClient.getCookie(true);
        return this.requestDownload(path, maxBytes, true);
      }

      if (!response.ok) {
        const payload = await response.text().catch(() => "");
        throw new ZenTaoApiError(
          toErrorCode(response.status),
          `附件下载失败: HTTP ${response.status}`,
          response.status,
          {
            path: sourcePath,
            response: payload.slice(0, 500),
          },
        );
      }

      const contentLengthText = response.headers.get("content-length");
      if (contentLengthText) {
        const contentLength = Number(contentLengthText);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", `附件大小超限，最大允许 ${maxBytes} 字节`, undefined, {
            path: sourcePath,
            contentLength,
          });
        }
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) {
        throw new ZenTaoApiError("INVALID_ARGUMENT", `附件大小超限，最大允许 ${maxBytes} 字节`, undefined, {
          path: sourcePath,
          contentLength: bytes.byteLength,
        });
      }

      return {
        sourcePath,
        content: bytes,
        contentType: response.headers.get("content-type") ?? undefined,
        filename: extractFilename(response.headers.get("content-disposition")),
      };
    } catch (error) {
      if (error instanceof ZenTaoApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ZenTaoApiError("UPSTREAM_TIMEOUT", "附件下载超时", undefined, { path: sourcePath });
      }
      throw new ZenTaoApiError("UPSTREAM_ERROR", "附件下载发生未知错误", undefined, {
        path: sourcePath,
        reason: String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestForm(
    method: string,
    path: string,
    body?: BodyInit,
    headers?: Record<string, string>,
    hasRetriedAuth = false,
  ): Promise<SessionFormResult> {
    const sourcePath = normalizeDownloadPath(path, this.baseUrl);
    const cookie = await this.authClient.getCookie(hasRetriedAuth);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${sourcePath}`, {
        method,
        headers: {
          Cookie: cookie,
          ...(headers ?? {}),
        },
        body,
        redirect: "manual",
        signal: controller.signal,
      });

      if ((response.status === 401 || response.status === 403) && !hasRetriedAuth) {
        await this.authClient.getCookie(true);
        return this.requestForm(method, path, body, headers, true);
      }

      const rawText = await response.text().catch(() => "");
      let payload: unknown = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = { raw: rawText.slice(0, 2000) };
        }
      }

      if (!response.ok) {
        throw new ZenTaoApiError(
          toErrorCode(response.status),
          `会话接口调用失败: HTTP ${response.status}`,
          response.status,
          { path: sourcePath, response: payload as Record<string, unknown> },
        );
      }

      if (isSessionActionFailed(payload)) {
        throw new ZenTaoApiError("UPSTREAM_ERROR", "会话操作失败", response.status, {
          path: sourcePath,
          response: payload as Record<string, unknown>,
        });
      }

      return {
        path: sourcePath,
        status: response.status,
        payload,
        rawText: rawText.slice(0, 2000),
      };
    } catch (error) {
      if (error instanceof ZenTaoApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ZenTaoApiError("UPSTREAM_TIMEOUT", "调用禅道会话接口超时", undefined, {
          path: sourcePath,
        });
      }
      throw new ZenTaoApiError("UPSTREAM_ERROR", "调用禅道会话接口发生未知错误", undefined, {
        path: sourcePath,
        reason: String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractFilename(contentDisposition: string | null): string | undefined {
  if (!contentDisposition) return undefined;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quoted = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = contentDisposition.match(/filename=([^;]+)/i);
  return plain?.[1]?.trim();
}

export function normalizeDownloadPath(path: string, baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const source = path.trim();
  if (!source) {
    throw new ZenTaoApiError("INVALID_ARGUMENT", "下载路径不能为空");
  }

  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source);
    const base = new URL(normalizedBase);
    if (url.origin !== base.origin) {
      throw new ZenTaoApiError("INVALID_ARGUMENT", "下载链接域名与禅道地址不一致");
    }
    return `${url.pathname}${url.search}`;
  }

  if (source.startsWith("/")) return source;
  return `/${source}`;
}

function resolveLocalFilePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 filePath 不能为空");
  }
  return nodePath.isAbsolute(trimmed) ? trimmed : nodePath.resolve(process.cwd(), trimmed);
}

function guessContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".log")) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function asObject(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === "object") return input as Record<string, unknown>;
  return undefined;
}

function isSessionActionFailed(payload: unknown): boolean {
  const root = asObject(payload);
  if (!root) return false;
  const result = root.result ?? root.status;
  if (result === false) return true;
  if (typeof result === "string") {
    return ["fail", "failed", "error"].includes(result.toLowerCase());
  }
  return false;
}
