import { ZenTaoApiError, toErrorCode } from "../domain/errors.js";
import type { ZenTaoSessionAuthClient } from "./sessionAuthClient.js";

export interface DownloadBinaryResult {
  sourcePath: string;
  content: Uint8Array;
  contentType?: string;
  filename?: string;
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
