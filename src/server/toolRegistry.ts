import type { AppConfig } from "../infra/config.js";
import type { ZenTaoApiClient } from "../zentao/apiClient.js";
import type { ZenTaoSessionApiClient } from "../zentao/sessionApiClient.js";
import { createAttachmentTools } from "../tools/attachments.js";
import { createBugTools } from "../tools/bugs.js";
import { createBuildTools } from "../tools/builds.js";
import { createExecutionTools } from "../tools/executions.js";
import { createHealthCheckTool } from "../tools/healthCheck.js";
import { createProductTools } from "../tools/products.js";
import { createProjectTools } from "../tools/projects.js";
import { createStoryTools } from "../tools/stories.js";
import { createTaskTools } from "../tools/tasks.js";
import { createUserTools } from "../tools/users.js";
import type { StandardResult } from "../domain/types.js";

export interface ToolContext {
  apiClient: ZenTaoApiClient;
  getApiClientForArgs: (args: Record<string, unknown>) => ZenTaoApiClient;
  sessionClient: ZenTaoSessionApiClient;
  getSessionClientForArgs: (args: Record<string, unknown>) => ZenTaoSessionApiClient;
  config: AppConfig;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<StandardResult>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(context: ToolContext) {
    const readOnlyTaskTools = new Set(["zentao_list_tasks", "zentao_get_task"]);
    const readOnlyBugTools = new Set(["zentao_list_bugs", "zentao_get_bug"]);
    const taskTools = createTaskTools(context).filter(
      (tool) => context.config.enableWriteTools || readOnlyTaskTools.has(tool.name),
    );
    const bugTools = createBugTools(context).filter(
      (tool) => context.config.enableWriteTools || readOnlyBugTools.has(tool.name),
    );
    const attachmentTools = context.config.enableAttachmentTools
      ? createAttachmentTools(context)
      : [];
    const definitions = [
      createHealthCheckTool(context),
      ...createProductTools(context),
      ...createProjectTools(context),
      ...createUserTools(context),
      ...createExecutionTools(context),
      ...createBuildTools(context),
      ...createStoryTools(context),
      ...attachmentTools,
      ...taskTools,
      ...bugTools,
    ];

    for (const tool of definitions) {
      this.tools.set(tool.name, tool);
    }
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}
