# 禅道（ZenTao）MCP 连接器需求书

## 1. 文档信息
- 文档版本：v1.0
- 创建日期：2026-02-28
- 适用对象：研发、测试、运维、产品、AI 工具接入方
- 目标系统：禅道开源版 18.13

## 2. 项目背景
团队希望通过 MCP（Model Context Protocol）将禅道中的项目、需求、任务、Bug 数据暴露给 AI Agent 和自动化工具，以提升需求追踪、交付分析、缺陷定位和日常协作效率。

当前痛点：
- AI 无法直接读取禅道结构化数据，问答和分析依赖人工复制粘贴。
- 项目/需求/任务/Bug 信息分散，跨对象追踪成本高。
- 缺乏统一、可复用的接口层，无法稳定支撑后续自动化场景。

## 3. 建设目标
- 提供一个稳定的、只读优先的禅道 MCP 服务。
- 首期覆盖四类核心对象：项目、需求、任务、Bug。
- 支持过滤、分页、详情查询和基础关联查询。
- 满足企业内网部署、安全审计、可观测和可扩展要求。

## 4. 范围定义

### 4.1 本期范围（In Scope）
- 禅道认证与 Token 管理。
- 项目列表/详情读取。
- 需求列表/详情读取（产品需求、项目需求）。
- 任务列表/详情读取（执行任务、项目任务）。
- Bug 列表/详情读取（产品 Bug、项目 Bug）。
- MCP 工具化输出（结构化 JSON）。
- 基础健康检查和错误处理。

### 4.2 非本期范围（Out of Scope）
- 批量创建、批量更新、批量删除等高风险写操作。
- 禅道流程配置、字段配置自动化。
- 禅道附件上传。
- 高级报表与 BI 可视化（可在后续迭代）。

## 5. 用户与使用场景
- 用户角色：
  - AI Agent（调用 MCP 工具）
  - 研发/测试/产品（通过 AI 间接访问）
  - 平台运维（配置、监控、审计）
- 典型场景：
  - 查询某项目下本周新增 Bug 并按严重程度分组。
  - 拉取某产品待处理需求并关联当前执行任务。
  - 获取任务详情用于自动生成日报/周报。

## 6. 业务与功能需求

### 6.1 功能需求列表（FR）
- FR-01：支持连接参数配置（禅道地址、账号、密码/凭据、超时、分页默认值）。
- FR-02：支持获取 Token，并在请求中注入 `Token` 头。
- FR-03：支持项目列表查询（分页、状态过滤、关键词过滤）。
- FR-04：支持项目详情查询（按项目 ID）。
- FR-05：支持需求列表查询（产品需求、项目需求；分页、状态过滤）。
- FR-06：支持需求详情查询（按需求 ID）。
- FR-07：支持任务列表查询（执行任务、项目任务；分页、指派人过滤、状态过滤）。
- FR-08：支持任务详情查询（按任务 ID）。
- FR-09：支持 Bug 列表查询（产品 Bug、项目 Bug；分页、严重程度、状态过滤）。
- FR-10：支持 Bug 详情查询（按 Bug ID）。
- FR-15：支持创建/更新任务（写操作）。
- FR-16：支持任务开始/暂停/重启/完成/关闭动作（写操作）。
- FR-13：支持创建 Bug（写操作）。
- FR-14：支持 Bug 指派/解决/关闭/激活动作（写操作）。
- FR-17：支持需求附件列表与附件下载（会话鉴权，下载返回 base64）。
- FR-18：支持任务附件列表与附件下载（会话鉴权，下载返回 base64）。
- FR-19：支持创建需求（`zentao_create_story`；`reviewer` 为 string[]，`branch` 为数字）。
- FR-20：创建/完成任务支持本环境必填字段（`estStarted` / `finishedDate` / `currentConsumed`，注意工时勿叠加）。
- FR-21：支持会话上传任务/需求附件（edit multipart `files[]`，不依赖 `api.php/v2/files`；提交前回填关键字段）。
- FR-22：支持任务记工与删除工时（会话 `recordEstimate` / `deleteEstimate-yes`）。
- FR-11：支持统一错误模型（认证失败、权限不足、参数错误、上游超时、上游异常）。
- FR-12：支持健康检查工具（禅道连通性、认证状态）。

### 6.2 MCP 工具清单（首期）
- `zentao_health_check`
- `zentao_list_projects`
- `zentao_get_project`
- `zentao_list_executions`
- `zentao_list_stories`
- `zentao_get_story`
- `zentao_list_story_attachments`
- `zentao_list_task_attachments`
- `zentao_download_attachment`
- `zentao_download_task_attachment`
- `zentao_list_tasks`
- `zentao_get_task`
- `zentao_create_task`
- `zentao_update_task`
- `zentao_start_task`
- `zentao_pause_task`
- `zentao_restart_task`
- `zentao_finish_task`
- `zentao_close_task`
- `zentao_list_bugs`
- `zentao_get_bug`
- `zentao_create_bug`
- `zentao_assign_bug`
- `zentao_resolve_bug`
- `zentao_close_bug`
- `zentao_activate_bug`

说明：
- 工具名可按团队命名规范调整，但应保持“资源 + 动作”一致性。
- 所有 `list` 工具必须支持 `page`、`limit`，并返回 `total`（若上游可提供）。

## 7. 接口与数据要求

### 7.1 禅道认证与基础约束
- 认证入口：`POST /api.php/v1/tokens`
- 认证参数：`account`、`password`
- 认证响应：返回 `token` 字段
- 鉴权方式：HTTP Header `Token: <token>`

### 7.2 资源读取能力（基于禅道 RESTful v1）
- 项目：`GET /api.php/v1/projects`
- 产品需求：`GET /api.php/v1/products/{productID}/stories`
- 项目需求：`GET /api.php/v1/projects/{projectID}/stories`
- 执行任务：`GET /api.php/v1/executions/{executionID}/tasks`
- 项目任务：`GET /api.php/v1/projects/{projectID}/tasks`
- 产品 Bug：`GET /api.php/v1/products/{productID}/bugs`
- 项目 Bug：`GET /api.php/v1/projects/{projectID}/bugs`

### 7.3 数据字段基线（最小可用集）
- 项目：`id`、`name`、`status`、`begin`、`end`、`PM`
- 需求：`id`、`title`、`status`、`stage`、`pri`、`openedBy`、`assignedTo`
- 任务：`id`、`name`、`status`、`pri`、`assignedTo`、`deadline`、`estimate`、`consumed`
- Bug：`id`、`title`、`status`、`severity`、`pri`、`openedBy`、`assignedTo`、`resolvedBy`

说明：
- 字段以禅道 18.13 实际返回为准，MCP 层需兼容字段缺失和空值。

## 8. 架构与技术方案

### 8.1 逻辑架构
- `MCP Server Adapter`：实现 MCP 协议、工具注册、参数校验。
- `ZenTao API Client`：封装 HTTP 请求、认证、重试、错误映射。
- `Domain Mapper`：统一对象模型，屏蔽禅道字段差异。
- `Cache & RateLimiter`：Token 缓存、短时结果缓存、请求节流。
- `Observability`：结构化日志、指标、链路追踪（可选）。

### 8.2 错误码与异常映射
- `AUTH_FAILED`：账号密码错误、Token 无效。
- `PERMISSION_DENIED`：资源无权限访问。
- `INVALID_ARGUMENT`：参数缺失、格式非法。
- `UPSTREAM_TIMEOUT`：禅道响应超时。
- `UPSTREAM_ERROR`：禅道 5xx 或异常响应。

### 8.3 安全要求
- 不在日志中输出明文密码、Token。
- 配置项支持环境变量注入。
- 必须支持 HTTPS（生产环境强制）。
- 提供 IP 白名单或网关层访问控制建议。

## 9. 非功能需求（NFR）
- NFR-01 可用性：月度可用性目标 >= 99.9%。
- NFR-02 性能：单次 `list` 请求（`limit<=100`）在内网场景 P95 < 2s（不含禅道重大抖动）。
- NFR-03 稳定性：上游超时后可快速失败，不阻塞 MCP 主线程。
- NFR-04 可维护性：核心模块单元测试覆盖率 >= 70%。
- NFR-05 可观测性：每次工具调用可追踪 `requestId`、耗时、结果状态。

## 10. 交付计划
- 里程碑 M1（1 周）：需求冻结、接口探测、原型联通。
- 里程碑 M2（1 周）：核心工具（项目/需求/任务/Bug 列表+详情）完成。
- 里程碑 M3（0.5 周）：错误处理、日志、健康检查、配置化。
- 里程碑 M4（0.5 周）：测试与验收、文档发布。

## 11. 验收标准
- AC-01：可成功获取 Token，并通过 Header 鉴权调用资源接口。
- AC-02：四类对象（项目/需求/任务/Bug）均可完成列表与详情查询。
- AC-03：分页和常用过滤参数可用，返回结构稳定。
- AC-04：认证失败、参数错误、上游超时均返回可识别错误码。
- AC-05：日志中无敏感字段明文泄露。
- AC-06：提供可执行的接入文档与示例调用。

## 12. 风险与待确认项
- 风险 R1：禅道版本小版本差异导致字段不一致。
- 风险 R2：Token 失效策略在不同部署环境中表现不一致。
- 风险 R3：大分页场景可能触发上游性能瓶颈。

待确认：
- 是否需要“跨对象聚合工具”（一次返回需求+任务+Bug 统计）。
- 是否需要按部门/团队进行字段级脱敏。
- 是否要求兼容禅道 API v2（本期建议先以 v1 为基线）。

## 13. 参考资料
- 禅道开源版 API 手册（RESTful v1 总览）  
  https://www.zentao.net/book/zentaopmshelp/710.html
- 获取 Token（v1）  
  https://www.zentao.net/book/api/1337.html
- 获取项目列表（v1）  
  https://www.zentao.net/book/api/1366.html
- 获取产品需求列表（v1）  
  https://www.zentao.net/book/api/1357.html
- 获取执行任务列表（v1）  
  https://www.zentao.net/book/api/1382.html
- 获取产品 Bug 列表（v1）  
  https://www.zentao.net/book/api/1394.html

> 以上链接于 2026-02-28 访问校验，若后续禅道升级，请在开发前再次核对接口行为。
