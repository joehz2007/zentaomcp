import type { AppConfig } from "../infra/config.js";
import type { ZenTaoApiClient } from "../zentao/apiClient.js";
import { createBugTools } from "../tools/bugs.js";
import { createExecutionTools } from "../tools/executions.js";
import { createHealthCheckTool } from "../tools/healthCheck.js";
import { createProjectTools } from "../tools/projects.js";
import { createStoryTools } from "../tools/stories.js";
import { createTaskTools } from "../tools/tasks.js";
import type { StandardResult } from "../domain/types.js";

export interface ToolContext {
  apiClient: ZenTaoApiClient;
  getApiClientForArgs: (args: Record<string, unknown>) => ZenTaoApiClient;
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
    const definitions = [
      createHealthCheckTool(context),
      ...createProjectTools(context),
      ...createExecutionTools(context),
      ...createStoryTools(context),
      ...createTaskTools(context),
      ...createBugTools(context),
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
