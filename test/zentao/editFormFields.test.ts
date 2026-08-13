import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRecordEffortFormFields,
  buildStoryEditFormFields,
  buildTaskEditFormFields,
} from "../../src/zentao/editFormFields.js";

describe("editFormFields", () => {
  it("builds task edit fields from nested task detail", () => {
    const fields = buildTaskEditFormFields({
      data: {
        task: {
          id: 36483,
          name: "迁移 openwebui",
          type: "devel",
          pri: 2,
          estimate: 16,
          story: 7453,
          module: 0,
          assignedTo: { account: "moomesy.liang" },
          desc: "desc",
          deadline: "2026-08-13",
          estStarted: "2026-08-13",
          status: "wait",
        },
      },
    });
    assert.deepEqual(fields, {
      name: "迁移 openwebui",
      type: "devel",
      pri: 2,
      estimate: 16,
      story: 7453,
      module: 0,
      assignedTo: "moomesy.liang",
      desc: "desc",
      deadline: "2026-08-13",
      estStarted: "2026-08-13",
      status: "wait",
    });
  });

  it("builds story edit fields including reviewers", () => {
    const fields = buildStoryEditFormFields({
      story: {
        title: "AI提效验收需求",
        spec: "spec body",
        verify: "verify body",
        pri: 2,
        category: "feature",
        source: "po",
        sourceNote: "note",
        keywords: "mcp",
        module: 332,
        branch: 0,
        assignedTo: "moomesy.liang",
        reviewer: ["lonny.xue", "moomesy.liang"],
      },
    });
    assert.equal(fields.title, "AI提效验收需求");
    assert.equal(fields.spec, "spec body");
    assert.equal(fields.branch, 0);
    assert.equal(fields["reviewer[0]"], "lonny.xue");
    assert.equal(fields["reviewer[1]"], "moomesy.liang");
  });

  it("builds record effort form indices", () => {
    const fields = buildRecordEffortFormFields([
      { date: "2026-08-13", consumed: 16, left: 0, work: "finish" },
      { id: 99, date: "2026-08-12", consumed: 2, left: 14, work: "partial" },
    ]);
    assert.deepEqual(fields, {
      "id[0]": "",
      "dates[0]": "2026-08-13",
      "consumed[0]": 16,
      "left[0]": 0,
      "work[0]": "finish",
      "id[1]": "99",
      "dates[1]": "2026-08-12",
      "consumed[1]": 2,
      "left[1]": 14,
      "work[1]": "partial",
    });
  });
});
