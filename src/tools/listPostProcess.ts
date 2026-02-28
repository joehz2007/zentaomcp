import { ZenTaoApiError } from "../domain/errors.js";

type SortOrder = "asc" | "desc";

export interface ListPostProcessOptions<T> {
  items: T[];
  keyword?: string;
  keywordSelector: (item: T) => Array<string | undefined>;
  equalsFilters?: Array<{
    value?: string;
    selector: (item: T) => string | undefined;
  }>;
  sortBy?: string;
  sortOrder?: SortOrder;
  sortSelectors?: Record<string, (item: T) => string | number | undefined>;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function compareValues(
  left: string | number | undefined,
  right: string | number | undefined,
  order: SortOrder,
): number {
  const l = left ?? "";
  const r = right ?? "";

  const isNumeric = typeof l === "number" || typeof r === "number";
  const base = isNumeric
    ? Number(l || 0) - Number(r || 0)
    : String(l).localeCompare(String(r), "zh-Hans-CN", { sensitivity: "base" });
  return order === "asc" ? base : -base;
}

export function postProcessList<T>(options: ListPostProcessOptions<T>): T[] {
  const {
    items,
    keyword,
    keywordSelector,
    equalsFilters = [],
    sortBy,
    sortOrder = "asc",
    sortSelectors = {},
  } = options;

  let result = [...items];

  const normalizedKeyword = normalize(keyword);
  if (normalizedKeyword) {
    result = result.filter((item) =>
      keywordSelector(item).some((fieldValue) => normalize(fieldValue).includes(normalizedKeyword)),
    );
  }

  for (const filter of equalsFilters) {
    const expected = normalize(filter.value);
    if (!expected) continue;
    result = result.filter((item) => normalize(filter.selector(item)) === expected);
  }

  if (sortBy) {
    const selector = sortSelectors[sortBy];
    if (!selector) {
      throw new ZenTaoApiError(
        "INVALID_ARGUMENT",
        `参数 sortBy 不支持值 ${sortBy}，可选值: ${Object.keys(sortSelectors).join(",")}`,
      );
    }
    result.sort((a, b) => compareValues(selector(a), selector(b), sortOrder));
  }

  return result;
}
