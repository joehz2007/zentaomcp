import type {
  StandardBug,
  StandardDetailResult,
  StandardExecution,
  StandardListResult,
  StandardProject,
  StandardStory,
  StandardTask,
} from "./models.js";

type AnyRecord = Record<string, unknown>;

function asObject(input: unknown): AnyRecord | undefined {
  return input && typeof input === "object" ? (input as AnyRecord) : undefined;
}

function asString(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "object" || typeof input === "function" || typeof input === "symbol") {
    return undefined;
  }
  const value = String(input).trim();
  return value || undefined;
}

function asNumber(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

function asId(input: unknown): number {
  const value = asNumber(input);
  return value ?? 0;
}

function pickString(source: AnyRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function pickNumber(source: AnyRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function asUserText(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  if (Array.isArray(input)) {
    const values = input.map((item) => asUserText(item)).filter(Boolean) as string[];
    return values.length > 0 ? values.join(",") : undefined;
  }

  const objectValue = asObject(input);
  if (!objectValue) return asString(input);

  return (
    pickString(objectValue, "account", "realname", "name", "username") ??
    asString(objectValue.id)
  );
}

function pickUserText(source: AnyRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asUserText(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function unwrap(payload: unknown): unknown {
  const root = asObject(payload);
  if (!root) return payload;
  if (root.data !== undefined) return root.data;
  return root;
}

function extractTotal(payload: unknown): number | undefined {
  const root = asObject(payload);
  if (!root) return undefined;
  const unwrapped = asObject(unwrap(payload));
  return (
    pickNumber(root, "total") ??
    pickNumber(asObject(root.pager) ?? {}, "recTotal") ??
    pickNumber(asObject(root.meta) ?? {}, "total") ??
    pickNumber(unwrapped ?? {}, "total") ??
    pickNumber(asObject(unwrapped?.pager) ?? {}, "recTotal") ??
    pickNumber(asObject(unwrapped?.meta) ?? {}, "total")
  );
}

function extractListData(payload: unknown, preferredKeys: string[]): AnyRecord[] {
  const root = unwrap(payload);
  if (Array.isArray(root)) return root.map((item) => asObject(item)).filter(Boolean) as AnyRecord[];

  const record = asObject(root);
  if (!record) return [];

  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map((item) => asObject(item)).filter(Boolean) as AnyRecord[];
    }
    const mapLike = asObject(value);
    if (mapLike) return Object.values(mapLike).map((item) => asObject(item)).filter(Boolean) as AnyRecord[];
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      return value.map((item) => asObject(item)).filter(Boolean) as AnyRecord[];
    }
  }

  const values = Object.values(record);
  if (values.length > 0 && values.every((value) => asObject(value))) {
    return values.map((value) => value as AnyRecord);
  }
  return [];
}

function extractDetailData(payload: unknown, preferredKeys: string[]): AnyRecord | undefined {
  const root = unwrap(payload);
  const record = asObject(root);
  if (!record) {
    if (Array.isArray(root) && root.length > 0) return asObject(root[0]);
    return undefined;
  }

  for (const key of preferredKeys) {
    const value = record[key];
    const detail = asObject(value);
    if (detail) return detail;
    if (Array.isArray(value) && value.length > 0) {
      const first = asObject(value[0]);
      if (first) return first;
    }
  }

  return record;
}

function mapProject(source: AnyRecord): StandardProject {
  return {
    id: asId(source.id),
    name: pickString(source, "name", "title") ?? "",
    status: pickString(source, "status"),
    startDate: pickString(source, "begin", "start", "startDate"),
    endDate: pickString(source, "end", "endDate"),
    owner: pickUserText(source, "PM", "pm", "owner"),
  };
}

function mapStory(source: AnyRecord): StandardStory {
  return {
    id: asId(source.id),
    title: pickString(source, "title", "name") ?? "",
    status: pickString(source, "status"),
    stage: pickString(source, "stage"),
    priority: pickString(source, "pri", "priority"),
    openedBy: pickUserText(source, "openedBy"),
    assignedTo: pickUserText(source, "assignedTo"),
  };
}

function mapTask(source: AnyRecord): StandardTask {
  return {
    id: asId(source.id),
    title: pickString(source, "name", "title") ?? "",
    status: pickString(source, "status"),
    priority: pickString(source, "pri", "priority"),
    assignedTo: pickUserText(source, "assignedTo"),
    deadline: pickString(source, "deadline"),
    estimateHours: pickNumber(source, "estimate"),
    consumedHours: pickNumber(source, "consumed"),
  };
}

function mapBug(source: AnyRecord): StandardBug {
  return {
    id: asId(source.id),
    title: pickString(source, "title", "name") ?? "",
    status: pickString(source, "status"),
    severity: pickString(source, "severity"),
    priority: pickString(source, "pri", "priority"),
    openedBy: pickUserText(source, "openedBy"),
    assignedTo: pickUserText(source, "assignedTo"),
    resolvedBy: pickUserText(source, "resolvedBy"),
  };
}

function mapExecution(source: AnyRecord): StandardExecution {
  return {
    id: asId(source.id),
    name: pickString(source, "name", "title") ?? "",
    status: pickString(source, "status"),
    startDate: pickString(source, "begin", "start", "startDate"),
    endDate: pickString(source, "end", "endDate"),
    projectId: pickNumber(source, "project", "projectId"),
    owner: pickUserText(source, "PM", "owner"),
  };
}

export function mapProjectList(payload: unknown): StandardListResult<StandardProject> {
  const items = extractListData(payload, ["projects", "projectList"]).map(mapProject);
  return { items, total: extractTotal(payload) ?? items.length, raw: payload };
}

export function mapProjectDetail(payload: unknown): StandardDetailResult<StandardProject> {
  const detail = extractDetailData(payload, ["project", "projects"]);
  return { item: detail ? mapProject(detail) : null, raw: payload };
}

export function mapStoryList(payload: unknown): StandardListResult<StandardStory> {
  const items = extractListData(payload, ["stories", "storyList"]).map(mapStory);
  return { items, total: extractTotal(payload) ?? items.length, raw: payload };
}

export function mapStoryDetail(payload: unknown): StandardDetailResult<StandardStory> {
  const detail = extractDetailData(payload, ["story", "stories"]);
  return { item: detail ? mapStory(detail) : null, raw: payload };
}

export function mapTaskList(payload: unknown): StandardListResult<StandardTask> {
  const items = extractListData(payload, ["tasks", "taskList"]).map(mapTask);
  return { items, total: extractTotal(payload) ?? items.length, raw: payload };
}

export function mapTaskDetail(payload: unknown): StandardDetailResult<StandardTask> {
  const detail = extractDetailData(payload, ["task", "tasks"]);
  return { item: detail ? mapTask(detail) : null, raw: payload };
}

export function mapBugList(payload: unknown): StandardListResult<StandardBug> {
  const items = extractListData(payload, ["bugs", "bugList"]).map(mapBug);
  return { items, total: extractTotal(payload) ?? items.length, raw: payload };
}

export function mapBugDetail(payload: unknown): StandardDetailResult<StandardBug> {
  const detail = extractDetailData(payload, ["bug", "bugs"]);
  return { item: detail ? mapBug(detail) : null, raw: payload };
}

export function mapExecutionList(payload: unknown): StandardListResult<StandardExecution> {
  const items = extractListData(payload, ["executions", "executionList"]).map(mapExecution);
  return { items, total: extractTotal(payload) ?? items.length, raw: payload };
}
