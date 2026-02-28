import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZenTaoApiError } from "../../src/domain/errors.js";
import { readEnum, readPagination } from "../../src/tools/common.js";

describe("tools/common", () => {
  it("clamps limit by maxLimit in readPagination", () => {
    const result = readPagination({ page: 2, limit: 999 }, 1, 20, 100);
    assert.deepEqual(result, { page: 2, limit: 100 });
  });

  it("throws INVALID_ARGUMENT when enum value is invalid", () => {
    assert.throws(
      () => readEnum({ scope: "invalid" }, "scope", ["project", "product"] as const),
      ZenTaoApiError,
    );
    try {
      readEnum({ scope: "invalid" }, "scope", ["project", "product"] as const);
    } catch (error) {
      const e = error as ZenTaoApiError;
      assert.equal(e.code, "INVALID_ARGUMENT");
    }
  });
});
