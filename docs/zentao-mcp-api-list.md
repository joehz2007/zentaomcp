# 禅道 MCP 接口清单与映射（V1）

## 1. 说明
- 本文用于把 MCP 工具与禅道 18.13 RESTful v1 端点做一一映射。
- 基础路径默认：`{baseUrl}/api.php/v1`
- 认证：先调用 `POST /tokens` 获取 Token，业务请求携带 Header：`Token: <token>`

## 2. MCP -> 禅道端点映射

| MCP 工具 | 禅道端点 | 方法 | 必填参数 | 备注 |
|---|---|---|---|---|
| `zentao_health_check` | `/tokens`（可选验证） | `POST` | `account,password` | 验证连通性和认证可用性 |
| `zentao_list_products` | `/products` | `GET` | 无 | 获取产品列表；用于 `list_bugs(scope=product)` 的 productId |
| `zentao_get_product` | `/products/{productId}` | `GET` | `productId` | 获取产品详情 |
| `zentao_list_projects` | `/projects` | `GET` | 无 | 支持分页与过滤 |
| `zentao_get_project` | `/projects/{projectId}` | `GET` | `projectId` | 获取项目详情 |
| `zentao_list_users` | `/users` | `GET` | 无 | 获取用户列表；用于解析 `assignedTo` 账号 |
| `zentao_list_executions` | `/projects/{projectId}/executions` | `GET` | `projectId` | 获取项目下执行列表，用于任务查询 |
| `zentao_list_builds` | `/executions/{executionId}/builds` | `GET` | `executionId` | 获取执行下版本列表；用于 `resolvedBuild` |
| `zentao_list_stories` | `/products/{scopeId}/stories` 或 `/projects/{scopeId}/stories` | `GET` | `scope,scopeId` | `scope in [product,project]` |
| `zentao_get_story` | `/stories/{storyId}` | `GET` | `storyId` | 获取需求详情；`data.raw.actions[]` 包含需求备注/评论/历史动作，`actions[].comment` 可用于提取补充说明或 PR 链接 |
| `zentao_list_story_attachments` | `/stories/{storyId}` | `GET` | `storyId` | 从需求详情中提取附件列表 |
| `zentao_download_attachment` | `/api-getsessionid.json` + `/user-login.json` + `/file-download-{fileId}.html` | `GET/POST/GET` | `storyId,fileId` | 会话鉴权下载附件，返回 base64 |
| `zentao_list_tasks` | `/executions/{scopeId}/tasks` 或 `/projects/{scopeId}/tasks` | `GET` | `scope,scopeId` | `scope in [execution,project]` |
| `zentao_get_task` | `/tasks/{taskId}` | `GET` | `taskId` | 获取任务详情；`data.raw.actions[]` 包含任务备注/评论/历史动作，`actions[].comment` 常用于提取 PR 链接 |
| `zentao_list_task_attachments` | `/tasks/{taskId}` | `GET` | `taskId` | 从任务详情中提取附件列表 |
| `zentao_download_task_attachment` | `/api-getsessionid.json` + `/user-login.json` + `/file-download-{fileId}.html` | `GET/POST/GET` | `taskId,fileId` | 会话鉴权下载任务附件，返回 base64 |
| `zentao_list_bug_attachments` | `/bugs/{bugId}` | `GET` | `bugId` | 从 Bug 详情中提取附件列表 |
| `zentao_download_bug_attachment` | `/api-getsessionid.json` + `/user-login.json` + `/file-download-{fileId}.html` | `GET/POST/GET` | `bugId,fileId` | 会话鉴权下载 Bug 附件，返回 base64 |
| `zentao_create_task` | `/executions/{executionId}/tasks` | `POST` | `executionId,name,type` | 创建任务（写操作） |
| `zentao_update_task` | `/tasks/{taskId}` | `PUT` | `taskId` | 更新任务（写操作） |
| `zentao_start_task` | `/tasks/{taskId}/start` | `POST` | `taskId,consumed` | 开始任务 |
| `zentao_pause_task` | `/tasks/{taskId}/pause` | `POST` | `taskId` | 暂停任务 |
| `zentao_restart_task` | `/tasks/{taskId}/restart` | `POST` | `taskId` | 重启任务 |
| `zentao_finish_task` | `/tasks/{taskId}/finish` | `POST` | `taskId,consumed` | 完成任务 |
| `zentao_close_task` | `/tasks/{taskId}/close` | `POST` | `taskId` | 关闭任务 |
| `zentao_list_bugs` | `/products/{scopeId}/bugs` 或 `/projects/{scopeId}/bugs` | `GET` | `scope,scopeId` | `scope in [product,project]` |
| `zentao_get_bug` | `/bugs/{bugId}` | `GET` | `bugId` | 获取 Bug 详情；`data.raw.actions[]` 含备注/历史，`actions[].comment` 可提取 MR |
| `zentao_create_bug` | `/products/{productId}/bugs` | `POST` | `productId,title,severity,priority,type` | 创建 Bug（写操作） |
| `zentao_assign_bug` | `/bugs/{bugId}/confirm` | `POST` | `bugId,assignedTo` | 指派 Bug（confirm 动作） |
| `zentao_resolve_bug` | `/bugs/{bugId}/resolve` | `POST` | `bugId,resolution`；可选 `resolvedBuild,comment,duplicateBug,assignedTo,mailto` | 解决 Bug（`resolvedBuild` 为解决版本） |
| `zentao_close_bug` | `/bugs/{bugId}/close` | `POST` | `bugId` | 关闭 Bug |
| `zentao_activate_bug` | `/bugs/{bugId}/active` | `POST` | `bugId` | 激活（重新打开）Bug |

## 3. 参数规范（MCP 入参）

### 3.1 通用分页参数
- `page`: 页码，从 1 开始，默认 `1`
- `limit`: 每页数量，默认 `20`，最大 `100`

### 3.2 通用账号覆盖参数（可选）
- `baseUrl`: 禅道地址（如 `https://zentao.company.local`）
- `account`: 禅道账号
- `password`: 禅道密码

说明：
- 三者要么都不传（走服务默认配置），要么三者同时传入（走个人账号）。
- 仅传部分字段会返回 `INVALID_ARGUMENT`。

### 3.3 通用过滤参数（按工具支持）
- `status`: 状态过滤
- `assignedTo`: 指派人
- `keyword`: 标题/关键词模糊查询（MCP 层可做二次过滤）
- `severity`: Bug 严重程度

### 3.4 通用排序参数（按工具支持）
- `sortBy`: 排序字段（每个 list 工具有独立白名单）
- `sortOrder`: 排序方向，`asc | desc`，默认 `asc`

### 3.5 作用域参数
- `scope`: 资源范围
- `scopeId`: 范围 ID

建议约束：
- `list_stories.scope`: `product | project`
- `list_tasks.scope`: `execution | project`
- `list_bugs.scope`: `product | project`

### 3.6 `sortBy` 白名单

| MCP 工具 | `sortBy` 允许值 |
|---|---|
| `zentao_list_products` | `id,name,status,code,owner` |
| `zentao_list_projects` | `id,name,status,startDate,endDate,owner` |
| `zentao_list_users` | `id,account,realname,role` |
| `zentao_list_executions` | `id,name,status,startDate,endDate,projectId,owner` |
| `zentao_list_builds` | `id,name,date,builder,productId,projectId,executionId` |
| `zentao_list_stories` | `id,title,status,stage,priority,assignedTo` |
| `zentao_list_tasks` | `id,title,status,priority,assignedTo,deadline,estimateHours,consumedHours` |
| `zentao_list_bugs` | `id,title,status,severity,priority,assignedTo,openedBy,resolvedBy` |

## 4. 输出结构（列表工具）

列表工具返回的 `data` 结构：
- `items`: 标准化对象数组（项目/需求/任务/Bug）
- `total`: 上游总量（多来源提取，无法获取时回退为 `items.length`）
- `filteredTotal`: MCP 二次过滤/排序后的结果数量
- `raw`: 禅道原始响应（用于排障和字段追溯）

任务查询建议：
- 若 `zentao_list_tasks(scope=project)` 返回 404，请先调用 `zentao_list_executions(projectId)` 获取 `executionId`，再使用 `scope=execution` 查询任务。

## 5. 字段映射建议（最小可用）

### 5.1 产品
- 禅道字段：`id,name,code,status,type,PO,QD,RD`
- MCP 字段：`id,name,code,status,type,owner,qd,rd`

### 5.2 项目
- 禅道字段：`id,name,status,begin,end,PM`
- MCP 字段：`id,name,status,startDate,endDate,owner`

### 5.3 用户
- 禅道字段：`id,account,realname,role,email,dept`
- MCP 字段：`id,account,realname,role,email,dept`

### 5.4 版本/构建
- 禅道字段：`id,name,date,builder,product,project,execution,desc`
- MCP 字段：`id,name,date,builder,productId,projectId,executionId,desc`

### 5.5 需求
- 禅道字段：`id,title,status,stage,pri,openedBy,assignedTo`
- MCP 字段：`id,title,status,stage,priority,openedBy,assignedTo`

### 5.6 任务
- 禅道字段：`id,name,status,pri,assignedTo,deadline,estimate,consumed`
- MCP 字段：`id,title,status,priority,assignedTo,deadline,estimateHours,consumedHours`

### 5.7 Bug
- 禅道字段：`id,title,status,severity,pri,openedBy,assignedTo,resolvedBy,product,project,module,type,resolution,resolvedBuild,steps`
- MCP 字段：`id,title,status,severity,priority,openedBy,assignedTo,resolvedBy,productId,projectId,moduleId,type,resolution,resolvedBuild,steps`

### 5.8 详情原始字段：actions / 评论 / 备注

`zentao_get_task`、`zentao_get_story`、`zentao_get_bug` 等详情工具会返回标准化 `item`，同时保留 `raw` 原始响应用于字段追溯。

对任务、需求和 Bug，禅道详情响应中的：

```text
data.raw.actions[]
```

包含备注、评论和历史动作。常用字段：

| 字段 | 说明 |
|---|---|
| `id` | action ID |
| `objectType` | 对象类型，如 `task` / `story` / `bug` |
| `objectID` | 对象 ID |
| `actor` | 操作人 |
| `action` | 动作，如 `opened` / `commented` / `edited` / `resolved` |
| `date` | 操作时间 |
| `comment` | 备注/评论正文；PR 链接通常在这里 |
| `history` | 字段变更历史 |

提取任务 PR 的推荐流程：

1. 调用 `zentao_get_task(taskId)`。
2. 遍历 `data.raw.actions[]`。
3. 读取每个 action 的 `comment` 字段。
4. 识别 GitHub `/pull/<id>`、GitLab `/merge_requests/<id>`、CodeUp `/change/<id>` 或 `repo#123`。
5. 如有关联需求，再调用 `zentao_get_story(storyId)`，同样扫描 `data.raw.actions[].comment`。
6. Bug 收尾同理：调用 `zentao_get_bug(bugId)` 扫描 `actions[].comment`。

因此通常不需要额外的 `list_comments` 工具；详情工具已经保留了可审计的评论/备注原始数据。

## 6. 错误码映射

| 场景 | MCP 错误码 | 说明 |
|---|---|---|
| 认证失败/Token 失效 | `AUTH_FAILED` | 登录失败或 Token 不可用 |
| 无权限访问 | `PERMISSION_DENIED` | 用户权限不足 |
| 参数非法 | `INVALID_ARGUMENT` | 缺少必填项、格式错误 |
| 禅道请求超时 | `UPSTREAM_TIMEOUT` | 网络慢或禅道处理超时 |
| 禅道异常响应 | `UPSTREAM_ERROR` | 5xx 或无法解析响应 |

## 7. 调用示例

### 7.1 查询项目下需求列表
```json
{
  "tool": "zentao_list_stories",
  "arguments": {
    "scope": "project",
    "scopeId": 101,
    "page": 1,
    "limit": 20,
    "status": "active"
  }
}
```

### 7.2 查询产品下 Bug 列表
```json
{
  "tool": "zentao_list_bugs",
  "arguments": {
    "scope": "product",
    "scopeId": 12,
    "page": 1,
    "limit": 50,
    "severity": "2",
    "sortBy": "priority",
    "sortOrder": "desc"
  }
}
```

## 8. 联调检查清单
1. 禅道账号是否有项目/产品/执行视图权限。
2. `POST /tokens` 是否可成功返回 `token`。
3. 各 `list` 接口是否返回可解析分页数据。
4. `sortBy` 传入非法字段时是否返回 `INVALID_ARGUMENT`。
5. 详情接口是否稳定返回关键字段。
6. 错误场景是否可映射到统一错误码。
