/**
 * 从 REST 详情组装会话 edit 表单字段，避免只传 files[] 时清空 name/story/estimate/spec 等。
 */

export type FormFieldValue = string | number | boolean;

function asObject(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return undefined;
}

function unwrapEntity(payload: unknown, keys: string[]): Record<string, unknown> {
  const root = asObject(payload) ?? {};
  const data = asObject(root.data);
  for (const key of keys) {
    const fromData = data ? asObject(data[key]) : undefined;
    if (fromData) return fromData;
    const fromRoot = asObject(root[key]);
    if (fromRoot) return fromRoot;
  }
  return data ?? root;
}

function accountOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  const obj = asObject(value);
  if (!obj) return "";
  const account = obj.account ?? obj.id;
  return account === undefined || account === null ? "" : String(account);
}

function scalar(value: unknown, fallback: string | number = ""): string | number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "object") {
    const obj = asObject(value);
    if (!obj) return fallback;
    if (obj.id !== undefined && obj.id !== null) return String(obj.id);
    if (obj.account !== undefined && obj.account !== null) return String(obj.account);
    return fallback;
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return value as string | number;
}

/** 从任务详情提取 task-edit 需回填的字段 */
export function buildTaskEditFormFields(payload: unknown): Record<string, FormFieldValue> {
  const task = unwrapEntity(payload, ["task"]);
  return {
    name: String(scalar(task.name, "")),
    type: String(scalar(task.type, "devel")),
    pri: Number(scalar(task.pri, 3)) || 3,
    estimate: Number(scalar(task.estimate, 0)) || 0,
    story: Number(scalar(task.story ?? task.storyID, 0)) || 0,
    module: Number(scalar(task.module, 0)) || 0,
    assignedTo: accountOf(task.assignedTo),
    desc: String(scalar(task.desc, "")),
    deadline: String(scalar(task.deadline, "")),
    estStarted: String(scalar(task.estStarted, "")),
    status: String(scalar(task.status, "")),
  };
}

/** 从需求详情提取 story-edit 需回填的字段 */
export function buildStoryEditFormFields(payload: unknown): Record<string, FormFieldValue> {
  const story = unwrapEntity(payload, ["story"]);
  const fields: Record<string, FormFieldValue> = {
    title: String(scalar(story.title, "")),
    spec: String(scalar(story.spec ?? story.desc, "")),
    verify: String(scalar(story.verify, "")),
    pri: Number(scalar(story.pri, 3)) || 3,
    category: String(scalar(story.category, "feature")),
    source: String(scalar(story.source, "")),
    sourceNote: String(scalar(story.sourceNote, "")),
    keywords: String(scalar(story.keywords, "")),
    module: Number(scalar(story.module, 0)) || 0,
    branch: Number(scalar(story.branch, 0)) || 0,
    assignedTo: accountOf(story.assignedTo),
  };

  const reviewers = story.reviewer;
  if (Array.isArray(reviewers)) {
    reviewers.forEach((item, index) => {
      const account = accountOf(item);
      if (account) fields[`reviewer[${index}]`] = account;
    });
  }

  return fields;
}

export type RecordEffortEntry = {
  id?: number | string;
  date: string;
  consumed: number;
  left: number;
  work?: string;
};

/** 组装 task-recordEstimate 表单字段（id[n]/dates[n]/consumed[n]/left[n]/work[n]） */
export function buildRecordEffortFormFields(entries: RecordEffortEntry[]): Record<string, FormFieldValue> {
  const fields: Record<string, FormFieldValue> = {};
  entries.forEach((entry, index) => {
    fields[`id[${index}]`] = entry.id === undefined || entry.id === null ? "" : String(entry.id);
    fields[`dates[${index}]`] = entry.date;
    fields[`consumed[${index}]`] = entry.consumed;
    fields[`left[${index}]`] = entry.left;
    fields[`work[${index}]`] = entry.work ?? "";
  });
  return fields;
}
