import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAttachmentTools } from "../../src/tools/attachments.js";
import type { ToolContext } from "../../src/server/toolRegistry.js";

function buildContext(overrides?: {
  apiClient?: Partial<ToolContext["apiClient"]>;
  sessionClient?: Partial<ToolContext["sessionClient"]>;
}): ToolContext {
  const apiClient = {
    getStory: async () => ({
      data: {
        story: {
          id: 150,
          files: {
            "701": {
              id: 701,
              title: "masking-plan",
              extension: "pdf",
              size: 1234,
              downloadUrl: "/file-download-701.html",
            },
          },
        },
      },
    }),
    getTask: async () => ({
      data: {
        task: {
          id: 88,
          attachments: [
            {
              fileID: 802,
              name: "execution-log.txt",
              ext: "txt",
              size: 2048,
              path: "file-download-802.html",
            },
          ],
        },
      },
    }),
    getBug: async () => ({
      data: {
        bug: {
          id: 66,
          files: [
            {
              id: 903,
              title: "repro.png",
              extension: "png",
              size: 512,
              downloadUrl: "/file-download-903.html",
            },
          ],
        },
      },
    }),
    ...(overrides?.apiClient ?? {}),
  } as unknown as ToolContext["apiClient"];

  const sessionClient = {
    downloadBinary: async () => ({
      sourcePath: "/file-download-701.html",
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      filename: "masking-plan.pdf",
    }),
    ...(overrides?.sessionClient ?? {}),
  } as unknown as ToolContext["sessionClient"];

  return {
    apiClient,
    getApiClientForArgs: () => apiClient,
    sessionClient,
    getSessionClientForArgs: () => sessionClient,
    config: {
      zentaoBaseUrl: "https://zentao.local",
      zentaoAccount: "admin",
      zentaoPassword: "pwd",
      zentaoTimeoutMs: 10000,
      zentaoTokenTtlMs: 100000,
      zentaoSessionTtlMs: 100000,
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
      enableWriteTools: false,
      enableAttachmentTools: true,
      attachmentMaxBytes: 10_000,
    },
  };
}

describe("attachments tool", () => {
  it("lists story attachments", async () => {
    const context = buildContext();
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_list_story_attachments");
    assert.ok(tool);

    const result = await tool.handler({ storyId: 150 });
    assert.equal(result.ok, true);
    const payload = result.data as { items: Array<{ id: number; title: string; extension?: string }> };
    assert.equal(payload.items.length, 1);
    assert.deepEqual(payload.items[0], {
      id: 701,
      title: "masking-plan",
      extension: "pdf",
      size: 1234,
      downloadPath: "/file-download-701.html",
    });
  });

  it("downloads attachment as base64", async () => {
    let capturedPath = "";
    let capturedMaxBytes = 0;
    const context = buildContext({
      sessionClient: {
        downloadBinary: async (path: string, maxBytes: number) => {
          capturedPath = path;
          capturedMaxBytes = maxBytes;
          return {
            sourcePath: path,
            content: new Uint8Array([0, 255]),
            contentType: "application/octet-stream",
            filename: "masked.txt",
          };
        },
      },
    });
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_download_attachment");
    assert.ok(tool);

    const result = await tool.handler({ storyId: 150, fileId: 701, maxBytes: 64 });
    assert.equal(result.ok, true);
    assert.equal(capturedPath, "/file-download-701.html");
    assert.equal(capturedMaxBytes, 64);
    const payload = result.data as {
      filename: string;
      contentBase64: string;
      size: number;
    };
    assert.equal(payload.filename, "masked.txt");
    assert.equal(payload.contentBase64, "AP8=");
    assert.equal(payload.size, 2);
  });

  it("lists task attachments", async () => {
    const context = buildContext();
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_list_task_attachments");
    assert.ok(tool);

    const result = await tool.handler({ taskId: 88 });
    assert.equal(result.ok, true);
    const payload = result.data as { items: Array<{ id: number; title: string; extension?: string }> };
    assert.equal(payload.items.length, 1);
    assert.deepEqual(payload.items[0], {
      id: 802,
      title: "execution-log.txt",
      extension: "txt",
      size: 2048,
      downloadPath: "/file-download-802.html",
    });
  });

  it("downloads task attachment as base64", async () => {
    let capturedPath = "";
    let capturedMaxBytes = 0;
    const context = buildContext({
      sessionClient: {
        downloadBinary: async (path: string, maxBytes: number) => {
          capturedPath = path;
          capturedMaxBytes = maxBytes;
          return {
            sourcePath: path,
            content: new Uint8Array([4, 5, 6]),
            contentType: "text/plain",
            filename: "execution-log.txt",
          };
        },
      },
    });
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_download_task_attachment");
    assert.ok(tool);

    const result = await tool.handler({ taskId: 88, fileId: 802, maxBytes: 512 });
    assert.equal(result.ok, true);
    assert.equal(capturedPath, "/file-download-802.html");
    assert.equal(capturedMaxBytes, 512);
    const payload = result.data as {
      taskId: number;
      filename: string;
      contentBase64: string;
      size: number;
    };
    assert.equal(payload.taskId, 88);
    assert.equal(payload.filename, "execution-log.txt");
    assert.equal(payload.contentBase64, "BAUG");
    assert.equal(payload.size, 3);
  });

  it("lists bug attachments", async () => {
    const context = buildContext();
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_list_bug_attachments");
    assert.ok(tool);

    const result = await tool.handler({ bugId: 66 });
    assert.equal(result.ok, true);
    const payload = result.data as { items: Array<{ id: number; title: string; extension?: string }> };
    assert.equal(payload.items.length, 1);
    assert.deepEqual(payload.items[0], {
      id: 903,
      title: "repro.png",
      extension: "png",
      size: 512,
      downloadPath: "/file-download-903.html",
    });
  });

  it("downloads bug attachment as base64", async () => {
    let capturedPath = "";
    const context = buildContext({
      sessionClient: {
        downloadBinary: async (path: string) => {
          capturedPath = path;
          return {
            sourcePath: path,
            content: new Uint8Array([7, 8]),
            contentType: "image/png",
            filename: "repro.png",
          };
        },
      },
    });
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_download_bug_attachment");
    assert.ok(tool);

    const result = await tool.handler({ bugId: 66, fileId: 903 });
    assert.equal(result.ok, true);
    assert.equal(capturedPath, "/file-download-903.html");
    const payload = result.data as { bugId: number; filename: string; contentBase64: string };
    assert.equal(payload.bugId, 66);
    assert.equal(payload.filename, "repro.png");
    assert.equal(payload.contentBase64, "Bwg=");
  });

  it("keeps title extension when session filename is missing", async () => {
    const context = buildContext({
      apiClient: {
        getStory: async () => ({
          data: {
            story: {
              id: 150,
              files: {
                "1774": {
                  id: 1774,
                  title: "系统日志脱敏数据清单.md",
                  extension: "txt",
                  size: 4059,
                  webPath: "/data/upload/1/202601/2116032001455cfa",
                },
              },
            },
          },
        }),
      },
      sessionClient: {
        downloadBinary: async () => ({
          sourcePath: "/data/upload/1/202601/2116032001455cfa",
          content: new Uint8Array([1]),
          contentType: "text/plain",
          filename: undefined,
        }),
      },
    });
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_download_attachment");
    assert.ok(tool);

    const result = await tool.handler({ storyId: 150, fileId: 1774 });
    assert.equal(result.ok, true);
    const payload = result.data as { filename: string };
    assert.equal(payload.filename, "系统日志脱敏数据清单.md");
  });

  it("does not append extension when title has no suffix", async () => {
    const context = buildContext({
      sessionClient: {
        downloadBinary: async () => ({
          sourcePath: "/file-download-701.html",
          content: new Uint8Array([1]),
          contentType: "application/pdf",
          filename: undefined,
        }),
      },
    });
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_download_attachment");
    assert.ok(tool);

    const result = await tool.handler({ storyId: 150, fileId: 701 });
    assert.equal(result.ok, true);
    const payload = result.data as { filename: string };
    assert.equal(payload.filename, "masking-plan");
  });

  it("returns INVALID_ARGUMENT when fileId does not exist", async () => {
    const context = buildContext();
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_download_attachment");
    assert.ok(tool);

    const result = await tool.handler({ storyId: 150, fileId: 999 });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "INVALID_ARGUMENT");
  });

  it("returns INVALID_ARGUMENT when task fileId does not exist", async () => {
    const context = buildContext();
    const tool = createAttachmentTools(context).find((item) => item.name === "zentao_download_task_attachment");
    assert.ok(tool);

    const result = await tool.handler({ taskId: 88, fileId: 999 });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "INVALID_ARGUMENT");
  });
});
