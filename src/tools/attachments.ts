import { ZenTaoApiError } from "../domain/errors.js";
import { errResult, okResult } from "../infra/result.js";
import { ENDPOINTS } from "../zentao/endpoints.js";
import {
  buildStoryEditFormFields,
  buildTaskEditFormFields,
} from "../zentao/editFormFields.js";
import type { ToolContext, ToolDefinition } from "../server/toolRegistry.js";
import {
  asRecord,
  authInputSchemaProperties,
  readPositiveInt,
  readString,
} from "./common.js";

interface ZenTaoAttachment {
  id: number;
  title: string;
  extension?: string;
  size?: number;
  downloadPath?: string;
  raw: Record<string, unknown>;
}

interface AttachmentTarget {
  idField: "storyId" | "taskId" | "bugId";
  idLabel: string;
  detailKeys: string[];
  listToolName: string;
  listDescription: string;
  listRequestPrefix: string;
  listErrorMessage: string;
  downloadToolName: string;
  downloadDescription: string;
  downloadRequestPrefix: string;
  downloadErrorMessage: string;
  loadPayload: (apiClient: ToolContext["apiClient"], id: number) => Promise<unknown>;
}

const storyAttachmentTarget: AttachmentTarget = {
  idField: "storyId",
  idLabel: "需求",
  detailKeys: ["story"],
  listToolName: "zentao_list_story_attachments",
  listDescription: "按需求 ID 查询附件列表（会话下载前置步骤）",
  listRequestPrefix: "story_attachments",
  listErrorMessage: "查询需求附件失败",
  downloadToolName: "zentao_download_attachment",
  downloadDescription: "下载需求附件（二进制内容会以 base64 返回）",
  downloadRequestPrefix: "attachment_download",
  downloadErrorMessage: "下载需求附件失败",
  loadPayload: (apiClient, storyId) => apiClient.getStory(storyId),
};

const taskAttachmentTarget: AttachmentTarget = {
  idField: "taskId",
  idLabel: "任务",
  detailKeys: ["task"],
  listToolName: "zentao_list_task_attachments",
  listDescription: "按任务 ID 查询附件列表（会话下载前置步骤）",
  listRequestPrefix: "task_attachments",
  listErrorMessage: "查询任务附件失败",
  downloadToolName: "zentao_download_task_attachment",
  downloadDescription: "下载任务附件（二进制内容会以 base64 返回）",
  downloadRequestPrefix: "task_attachment_download",
  downloadErrorMessage: "下载任务附件失败",
  loadPayload: (apiClient, taskId) => apiClient.getTask(taskId),
};

const bugAttachmentTarget: AttachmentTarget = {
  idField: "bugId",
  idLabel: "Bug",
  detailKeys: ["bug"],
  listToolName: "zentao_list_bug_attachments",
  listDescription: "按 Bug ID 查询附件列表（会话下载前置步骤）",
  listRequestPrefix: "bug_attachments",
  listErrorMessage: "查询 Bug 附件失败",
  downloadToolName: "zentao_download_bug_attachment",
  downloadDescription: "下载 Bug 附件（二进制内容会以 base64 返回）",
  downloadRequestPrefix: "bug_attachment_download",
  downloadErrorMessage: "下载 Bug 附件失败",
  loadPayload: (apiClient, bugId) => apiClient.getBug(bugId),
};

export function createAttachmentTools(
  context: ToolContext,
  options?: { enableUpload?: boolean },
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createListAttachmentsTool(context, storyAttachmentTarget),
    createListAttachmentsTool(context, taskAttachmentTarget),
    createListAttachmentsTool(context, bugAttachmentTarget),
    createDownloadAttachmentTool(context, storyAttachmentTarget),
    createDownloadAttachmentTool(context, taskAttachmentTarget),
    createDownloadAttachmentTool(context, bugAttachmentTarget),
  ];
  if (options?.enableUpload) {
    tools.push(createUploadTaskAttachmentTool(context), createUploadStoryAttachmentTool(context));
  }
  return tools;
}

function createListAttachmentsTool(context: ToolContext, target: AttachmentTarget): ToolDefinition {
  return {
    name: target.listToolName,
    description: target.listDescription,
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        [target.idField]: { type: "integer", minimum: 1 },
      },
      required: [target.idField],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `${target.listRequestPrefix}_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const ownerId = readPositiveInt(args, target.idField, true);
        const payload = await target.loadPayload(apiClient, ownerId);
        const attachments = extractAttachments(payload, target.detailKeys);
        return okResult(
          {
            [target.idField]: ownerId,
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
        return errResult("UPSTREAM_ERROR", target.listErrorMessage, requestId, { reason: String(error) });
      }
    },
  };
}

function createDownloadAttachmentTool(context: ToolContext, target: AttachmentTarget): ToolDefinition {
  return {
    name: target.downloadToolName,
    description: target.downloadDescription,
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        [target.idField]: { type: "integer", minimum: 1 },
        fileId: { type: "integer", minimum: 1 },
        maxBytes: { type: "integer", minimum: 1 },
      },
      required: [target.idField, "fileId"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `${target.downloadRequestPrefix}_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const sessionClient = context.getSessionClientForArgs(args);
        const ownerId = readPositiveInt(args, target.idField, true);
        const fileId = readPositiveInt(args, "fileId", true);
        const maxBytes = readPositiveInt(
          args,
          "maxBytes",
          false,
          context.config.attachmentMaxBytes,
        );
        const payload = await target.loadPayload(apiClient, ownerId);
        const attachments = extractAttachments(payload, target.detailKeys);
        const attachment = attachments.find((item) => item.id === fileId);
        if (!attachment) {
          throw new ZenTaoApiError("INVALID_ARGUMENT", `${target.idLabel} ${ownerId} 下未找到附件 ${fileId}`);
        }

        const fallbackPath = ENDPOINTS.fileDownloadById(fileId);
        const downloadPath = attachment.downloadPath ?? fallbackPath;
        const downloadResult = await sessionClient.downloadBinary(downloadPath, maxBytes);
        const filename = downloadResult.filename ?? buildFilename(attachment);
        const base64 = Buffer.from(downloadResult.content).toString("base64");

        return okResult(
          {
            [target.idField]: ownerId,
            fileId,
            filename,
            title: attachment.title,
            extension: attachment.extension,
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
        return errResult("UPSTREAM_ERROR", target.downloadErrorMessage, requestId, { reason: String(error) });
      }
    },
  };
}

function createUploadTaskAttachmentTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_upload_task_attachment",
    description:
      "上传任务附件（会话 task-edit multipart files[]）。不依赖 api.php/v2/files。提交前会 get 任务并回填 name/type/pri/estimate/story/assignedTo 等，避免只传 files 清空字段。",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        taskId: { type: "integer", minimum: 1 },
        filePath: { type: "string", minLength: 1 },
        comment: { type: "string" },
      },
      required: ["taskId", "filePath"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `task_attachment_upload_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const sessionClient = context.getSessionClientForArgs(args);
        const taskId = readPositiveInt(args, "taskId", true);
        const filePath = readString(args, "filePath");
        if (!filePath) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 filePath 不能为空");
        const detail = await apiClient.getTask(taskId);
        const fields = buildTaskEditFormFields(detail);
        const comment = readString(args, "comment");
        if (comment) fields.comment = comment;
        const result = await sessionClient.postMultipart(
          ENDPOINTS.taskEditById(taskId),
          fields,
          { filePath },
        );
        return okResult(
          {
            taskId,
            filePath,
            preservedFields: fields,
            session: result.payload,
          },
          requestId,
        );
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "上传任务附件失败", requestId, { reason: String(error) });
      }
    },
  };
}

function createUploadStoryAttachmentTool(context: ToolContext): ToolDefinition {
  return {
    name: "zentao_upload_story_attachment",
    description:
      "上传需求附件（会话 story-edit multipart files[]）。不依赖 api.php/v2/files。提交前会 get 需求并回填 title/spec/pri 等关键字段；可选 comment。",
    inputSchema: {
      type: "object",
      properties: {
        ...authInputSchemaProperties,
        storyId: { type: "integer", minimum: 1 },
        filePath: { type: "string", minLength: 1 },
        comment: { type: "string" },
      },
      required: ["storyId", "filePath"],
      additionalProperties: false,
    },
    handler: async (rawArgs) => {
      const requestId = `story_attachment_upload_${Date.now()}`;
      const args = asRecord(rawArgs);
      try {
        const apiClient = context.getApiClientForArgs(args);
        const sessionClient = context.getSessionClientForArgs(args);
        const storyId = readPositiveInt(args, "storyId", true);
        const filePath = readString(args, "filePath");
        if (!filePath) throw new ZenTaoApiError("INVALID_ARGUMENT", "参数 filePath 不能为空");
        const detail = await apiClient.getStory(storyId);
        const fields = buildStoryEditFormFields(detail);
        const comment = readString(args, "comment");
        if (comment) fields.comment = comment;
        const result = await sessionClient.postMultipart(
          ENDPOINTS.storyEditById(storyId),
          fields,
          { filePath },
        );
        return okResult(
          {
            storyId,
            filePath,
            preservedFields: fields,
            session: result.payload,
          },
          requestId,
        );
      } catch (error) {
        if (error instanceof ZenTaoApiError) {
          return errResult(error.code, error.message, requestId, error.details);
        }
        return errResult("UPSTREAM_ERROR", "上传需求附件失败", requestId, { reason: String(error) });
      }
    },
  };
}

function buildFilename(attachment: ZenTaoAttachment): string {
  const title = attachment.title.trim();
  if (title) return title;
  return `attachment_${attachment.id}`;
}

function extractAttachments(payload: unknown, detailKeys: string[]): ZenTaoAttachment[] {
  const filesContainer = findFilesContainer(payload, detailKeys);
  if (!filesContainer) return [];
  const records = toRecordArray(filesContainer);

  const items: ZenTaoAttachment[] = [];
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

function findFilesContainer(payload: unknown, detailKeys: string[]): unknown {
  const root = asObject(payload);
  if (!root) return undefined;

  const data = asObject(root.data);
  const detailCandidates = detailKeys.flatMap((key) => [
    data ? asObject(data[key]) : undefined,
    asObject(root[key]),
  ]);
  const candidates = [...detailCandidates, data, root];

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
