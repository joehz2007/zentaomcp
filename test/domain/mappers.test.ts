import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapBugDetail, mapProjectList, mapStoryList, mapTaskList } from "../../src/domain/mappers.js";

describe("domain mappers", () => {
  it("maps project list from map-like payload", () => {
    const payload = {
      projects: {
        "1": { id: "1", name: "项目A", status: "doing", begin: "2026-01-01", end: "2026-02-01", PM: "alice" },
      },
      pager: { recTotal: "1" },
    };

    const result = mapProjectList(payload);
    assert.equal(result.total, 1);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0], {
      id: 1,
      name: "项目A",
      status: "doing",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      owner: "alice",
    });
  });

  it("maps bug detail from nested payload", () => {
    const payload = {
      bug: {
        id: 2,
        title: "支付回调失败",
        status: "active",
        severity: "1",
        pri: "2",
        openedBy: { account: "bob", realname: "鲍勃" },
        assignedTo: { realname: "卡罗尔" },
        resolvedBy: { id: 77 },
      },
    };

    const result = mapBugDetail(payload);
    assert.deepEqual(result.item, {
      id: 2,
      title: "支付回调失败",
      status: "active",
      severity: "1",
      priority: "2",
      openedBy: "bob",
      assignedTo: "卡罗尔",
      resolvedBy: "77",
    });
  });

  it("maps owner/assignee when user fields are objects", () => {
    const payload = {
      data: {
        tasks: [
          {
            id: 11,
            name: "任务A",
            assignedTo: { account: "wujiang", realname: "吴江" },
          },
        ],
      },
    };
    const projectPayload = {
      projects: [{ id: 1, name: "项目A", PM: { realname: "宋善善" } }],
    };

    const taskResult = mapTaskList(payload);
    const projectResult = mapProjectList(projectPayload);
    assert.equal(projectResult.items[0]?.owner, "宋善善");
    assert.equal(taskResult.items[0]?.assignedTo, "wujiang");
  });

  it("extracts total from nested data pager", () => {
    const payload = {
      data: {
        stories: [{ id: 1, title: "S1" }, { id: 2, title: "S2" }],
        pager: { recTotal: "88" },
      },
    };

    const result = mapStoryList(payload);
    assert.equal(result.total, 88);
    assert.equal(result.items.length, 2);
  });
});
