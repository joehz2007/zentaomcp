# 禅道 MCP 技术设计说明（V1）

## 1. 设计目标
- 基于禅道开源版 18.13 的 RESTful v1 API，构建只读优先的 MCP 服务。
- 提供统一工具接口，支持项目、需求、任务、Bug 的列表与详情查询。
- 保障可维护性、安全性、可观测性，满足后续扩展写操作的架构预留。

## 2. 技术选型
- 运行时：Node.js 20+
- 语言：TypeScript
- 协议层：MCP Server SDK
- HTTP 客户端：`undici` 或 `axios`（二选一）
- 配置：`.env` + 环境变量注入
- 日志：结构化 JSON 日志（`pino` 或同类）
- 测试：Node 内置测试器（`node:test`）+ mock 集成测试

说明：若团队主栈为 Java，也可用 Spring Boot 实现同样分层，不影响需求范围。

## 3. 分层与模块划分

### 3.1 目录建议
```text
src/
  server/
    mcpServer.ts
    toolRegistry.ts
    toolRuntime.ts
  tools/
    healthCheck.ts
    projects.ts
    stories.ts
    tasks.ts
    bugs.ts
    listPostProcess.ts
  zentao/
    authClient.ts
    apiClient.ts
    endpoints.ts
  domain/
    models.ts
    mappers.ts
    errors.ts
  infra/
    cache.ts
    rateLimiter.ts
    logger.ts
    config.ts
test/
  domain/
  tools/
  zentao/
  server/
```

### 3.2 职责说明
- `toolRegistry`：注册 MCP 工具、输入校验、输出规范化。
- `tools/*`：工具编排层，只处理参数和响应包装。
- `zentao/apiClient`：统一 HTTP 调用、重试、超时、错误映射。
- `zentao/authClient`：Token 获取、缓存、失效刷新。
- `domain/mappers`：禅道字段到 MCP 领域对象的映射。
- `infra/*`：配置、日志、缓存、限流。

## 4. 关键流程设计

### 4.1 认证流程
1. 启动时读取 `ZENTAO_BASE_URL`、`ZENTAO_ACCOUNT`、`ZENTAO_PASSWORD`。
2. 首次调用前通过 `POST /api.php/v1/tokens` 获取 Token。
3. Token 写入内存缓存（附带过期时间或保守 TTL）。
4. 业务请求注入 Header：`Token: <token>`。
5. 若返回鉴权失败，触发一次 Token 刷新并重试一次。

### 4.2 列表查询流程
1. MCP 工具接收参数（`scope`、`scopeId`、`page`、`limit`、过滤条件）。
2. 参数校验与默认值填充。
3. 路由到对应禅道端点（见接口清单）。
4. 执行请求并进行字段映射（标准字段 + `raw`）。
5. 在 MCP 层进行二次过滤/排序，输出 `filteredTotal`。
6. 返回统一输出：`{ ok, data, meta, error }`。

## 5. 统一数据契约

### 5.1 工具输出基类
```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "req_20260228_xxx",
    "page": 1,
    "limit": 20,
    "total": 0
  },
  "error": null
}
```

### 5.2 错误对象
```json
{
  "ok": false,
  "data": null,
  "meta": {
    "requestId": "req_20260228_xxx"
  },
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "请求禅道超时",
    "details": {}
  }
}
```

## 6. 参数与路由策略
- `list_stories`：
  - `scope=product` -> `/api.php/v1/products/{scopeId}/stories`
  - `scope=project` -> `/api.php/v1/projects/{scopeId}/stories`
- `list_tasks`：
  - `scope=execution` -> `/api.php/v1/executions/{scopeId}/tasks`
  - `scope=project` -> `/api.php/v1/projects/{scopeId}/tasks`
- `list_bugs`：
  - `scope=product` -> `/api.php/v1/products/{scopeId}/bugs`
  - `scope=project` -> `/api.php/v1/projects/{scopeId}/bugs`

## 7. 配置项设计
- `ZENTAO_BASE_URL`：禅道地址（如 `https://zentao.company.local`）
- `ZENTAO_ACCOUNT`：账号
- `ZENTAO_PASSWORD`：密码
- `ZENTAO_TIMEOUT_MS`：请求超时（默认 10000）
- `ZENTAO_TOKEN_TTL_MS`：Token 缓存 TTL（默认 3000000）
- `MCP_DEFAULT_PAGE`：默认页码（默认 1）
- `MCP_DEFAULT_LIMIT`：默认每页（默认 20）
- `MCP_MAX_LIMIT`：最大每页（默认 100）

## 8. 安全设计
- 不在日志输出明文密码、Token、完整 Cookie。
- 配置读取后仅保留必要字段，敏感值脱敏展示。
- 生产强制 HTTPS，禁止明文传输。
- 可选增加来源 IP 白名单与网关鉴权。

## 9. 可观测性设计
- 日志字段：`requestId`、`toolName`、`latencyMs`、`upstreamStatus`、`result`。
- 指标建议：
  - `mcp_tool_calls_total{toolName,status}`
  - `mcp_tool_latency_ms{toolName}`
  - `zentao_api_calls_total{endpoint,status}`
  - `zentao_api_errors_total{code}`

## 10. 测试策略
- 单元测试：
  - 参数校验（必填、范围、枚举）
  - 路由映射（scope -> endpoint）
  - 错误码映射
- 集成测试：
  - Token 获取成功/失败
  - 四类对象列表与详情
  - 超时与重试行为
- 回归测试：
  - 关键字段兼容（字段缺失、空值）

## 11. 实施任务拆分
1. 初始化项目与基础框架（MCP server + config + logger）。
2. 完成 `authClient` 与 `apiClient`。
3. 实现四类对象的 `list/get` 工具。
4. 增加统一错误模型、健康检查工具。
5. 完成测试与接入文档。

## 12. 发布与运维建议
- 首发灰度：先接入 1 个测试禅道实例。
- 运行模式：容器化部署，单实例起步。
- 失败策略：上游持续失败时返回快速失败，避免堆积。
- 升级策略：禅道版本升级前先跑兼容性用例。
