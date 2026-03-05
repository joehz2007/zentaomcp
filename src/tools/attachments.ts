import { ZenTaoApiError } from "../domain/errors.js";
import { errResult, okResult } from "../infra/result.js";
import { ENDPOINTS } from "../zentao/endpoints.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import {
  asRecord,
  authInputSchemaProperties,
  readPositiveInt,
} from "./common.js";

interface StoryAttachment {
  id: number;
  title: string;
  extension?: string;
  size?: number;
  downloadPath?: string;
  raw: Record<string, unknown>;
}

export function createAttachmentTools(context: ToolContext): ToolDefinition[] {
  return [createListStoryAttachmentsTool(context), createDownloadAttachmentTool(context)];
}

function createListStoryAttachmentsTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_list_story_attachments",
    description: "按需求 ID 查询附件列表（会话下载前置步骤）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        storyId: { type: "integer", minimum: 1 },
      },
      required: ["storyId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `story_attachments_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const storyId = readPositiveInt(args, "storyId", true);
        const payload = await apiClient.getStory(storyId);
        const attachments = extractStoryAttachments(payload);
        return okResult(
          {
            storyId,
            items: attachments.map((item) => ({
              id: item.id,
              title: item.title,
              extension: item.extension,
              size: item.size,
              downloadPath: item.downloadPath,
            })),
            total: attachments.length,
            raw: payload,
          },
          requestId,
        );
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "查询需求附件失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createDownloadAttachmentTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_download_attachment",
    description: "下载需求附件（二进制内容会以 base64 返回）",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        storyId: { type: "integer", minimum: 1 },
        fileId: { type: "integer", minimum: 1 },
        maxBytes: { type: "integer", minimum: 1 },
      },
      required: ["storyId", "fileId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `attachment_download_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const sessionClient = context.getSessionClientForArgs(args);
        const storyId = readPositiveInt(args, "storyId", true);
        const fileId = readPositiveInt(args, "fileId", true);
        const maxBytes = readPositiveInt(
          args,
          "maxBytes",
          false,
          context.config.attachmentMaxBytes,
        );
        const payload = await apiClient.getStory(storyId);
        const attachments = extractStoryAttachments(payload);
        const target = attachments.find((item) => item.id === fileId);
        if (!target) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", `需求 ${storyId} 下未找到附件 ${fileId}`);
        }

        const fallbackPath = ENDPOINTS.fileDownloadById(fileId);
        const downloadPath = target.downloadPath ?? fallbackPath;
        const downloadResult = await sessionClient.downloadBinary(downloadPath, maxBytes);
        const filename = downloadResult.filename ?? buildFilename(target);
        const base64 = Buffer.from(downloadResult.content).toString("base64");

        return okResult(
          {
            storyId,
            fileId,
            filename,
            title: target.title,
            extension: target.extension,
            size: downloadResult.content.byteLength,
            contentType: downloadResult.contentType,
            sourcePath: downloadResult.sourcePath,
            encoding: "base64",
            contentBase64: base64,
          },
          requestId,
        );
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "下载需求附件失败", requestId, { reason: String(error) });
      }
    },
  };
}

function buildFilename(attachment: StoryAttachment): string {
  const title = attachment.title.trim();
  if (!attachment.extension) return title || `attachment_${attachment.id}`;
  if (title.toLowerCase().endsWith(`.${attachment.extension.toLowerCase()}`)) {
    return title;
  }
  return `${title || `attachment_${attachment.id}`}.${attachment.extension}`;
}

function extractStoryAttachments(payload: unknown): StoryAttachment[] {
  const filesContainer = findFilesContainer(payload);
  if (!filesContainer) return [];
  const records = toRecordArray(filesContainer);

  const items: StoryAttachment[] = [];
  for (const source of records) {
    const id = pickNumber(source, "id", "fileID", "fileId");
    if (!id || id <= 0) continue;

    const title =
      pickString(source, "title", "name", "realName", "filename") ??
      `attachment_${id}`;
    const extension = pickString(source, "extension", "ext");
    const size = pickNumber(source, "size");
    const downloadPath = resolveDownloadPath(source);
    items.push({
      id,
      title,
      extension,
      size,
      downloadPath,
      raw: source,
    });
  }
  return items;
}

function findFilesContainer(payload: unknown): unknown {
  const root = asObject(payload);
  if (!root) return undefined;

  const data = asObject(root.data);
  const story = asObject(root.story);
  const dataStory = data ? asObject(data.story) : undefined;
  const candidates = [dataStory, story, data, root];

  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const key of ["files", "fileList", "attachments"]) {
      const value = candidate[key];
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function resolveDownloadPath(source: Record<string, unknown>): string | undefined {
  const direct = pickString(
    source,
    "downloadUrl",
    "downloadURL",
    "downloadLink",
    "download",
    "url",
    "webPath",
    "pathname",
    "path",
  );
  if (!direct) return undefined;
  if (/^https?:\/\//i.test(direct)) {
    try {
      const url = new URL(direct);
      return `${url.pathname}${url.search}`;
    } catch {
      return undefined;
    }
  }
  if (direct.startsWith("/")) return direct;
  return `/${direct}`;
}

function toRecordArray(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) {
    return input.map(asObject).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  const record = asObject(input);
  if (!record) return [];
  return Object.values(record)
    .map(asObject)
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function asObject(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === "object") return input as Record<string, unknown>;
  return undefined;
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
}

function pickNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === "") continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}
