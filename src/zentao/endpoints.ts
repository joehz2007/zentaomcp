export const ENDPOINTS = {
  tokens: "/api.php/v1/tokens",
  sessionId: "/api-getsessionid.json",
  userLogin: "/user-login.json",
  products: "/api.php/v1/products",
  productById: (productId: number) => `/api.php/v1/products/${productId}`,
  users: "/api.php/v1/users",
  projects: "/api.php/v1/projects",
  projectById: (projectId: number) => `/api.php/v1/projects/${projectId}`,
  storiesByProduct: (productId: number) => `/api.php/v1/products/${productId}/stories`,
  storiesByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/stories`,
  createStoryByProduct: (productId: number) => `/api.php/v1/products/${productId}/stories`,
  storyById: (storyId: number) => `/api.php/v1/stories/${storyId}`,
  executionsByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/executions`,
  buildsByExecution: (executionId: number) => `/api.php/v1/executions/${executionId}/builds`,
  tasksByExecution: (executionId: number) => `/api.php/v1/executions/${executionId}/tasks`,
  tasksByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/tasks`,
  createTaskByExecution: (executionId: number) => `/api.php/v1/executions/${executionId}/tasks`,
  taskById: (taskId: number) => `/api.php/v1/tasks/${taskId}`,
  startTaskById: (taskId: number) => `/api.php/v1/tasks/${taskId}/start`,
  pauseTaskById: (taskId: number) => `/api.php/v1/tasks/${taskId}/pause`,
  restartTaskById: (taskId: number) => `/api.php/v1/tasks/${taskId}/restart`,
  finishTaskById: (taskId: number) => `/api.php/v1/tasks/${taskId}/finish`,
  closeTaskById: (taskId: number) => `/api.php/v1/tasks/${taskId}/close`,
  bugsByProduct: (productId: number) => `/api.php/v1/products/${productId}/bugs`,
  bugsByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/bugs`,
  createBugByProduct: (productId: number) => `/api.php/v1/products/${productId}/bugs`,
  bugById: (bugId: number) => `/api.php/v1/bugs/${bugId}`,
  confirmBugById: (bugId: number) => `/api.php/v1/bugs/${bugId}/confirm`,
  closeBugById: (bugId: number) => `/api.php/v1/bugs/${bugId}/close`,
  activateBugById: (bugId: number) => `/api.php/v1/bugs/${bugId}/active`,
  resolveBugById: (bugId: number) => `/api.php/v1/bugs/${bugId}/resolve`,
  fileDownloadById: (fileId: number) => `/file-download-${fileId}.html`,
  /** 会话：编辑任务并上传附件（勿用 api.php/v2/files） */
  taskEditById: (taskId: number) => `/task-edit-${taskId}.json`,
  /** 会话：编辑需求并上传附件 */
  storyEditById: (storyId: number) => `/story-edit-${storyId}.json`,
  /** 会话：记工 */
  taskRecordEstimateById: (taskId: number) => `/task-recordEstimate-${taskId}.json`,
  /** 会话：删除工时记录（确认路径） */
  taskDeleteEstimateById: (effortId: number) => `/task-deleteEstimate-${effortId}-yes.html`,
};

export function withQuery(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}
