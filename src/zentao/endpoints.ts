export const ENDPOINTS = {
  tokens: "/api.php/v1/tokens",
  projects: "/api.php/v1/projects",
  projectById: (projectId: number) => `/api.php/v1/projects/${projectId}`,
  storiesByProduct: (productId: number) => `/api.php/v1/products/${productId}/stories`,
  storiesByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/stories`,
  storyById: (storyId: number) => `/api.php/v1/stories/${storyId}`,
  executionsByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/executions`,
  tasksByExecution: (executionId: number) => `/api.php/v1/executions/${executionId}/tasks`,
  tasksByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/tasks`,
  taskById: (taskId: number) => `/api.php/v1/tasks/${taskId}`,
  bugsByProduct: (productId: number) => `/api.php/v1/products/${productId}/bugs`,
  bugsByProject: (projectId: number) => `/api.php/v1/projects/${projectId}/bugs`,
  bugById: (bugId: number) => `/api.php/v1/bugs/${bugId}`,
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
