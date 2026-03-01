# zentao-mcp

ZenTao 18.13 的只读 MCP 服务（TypeScript）。

## 已发布 npm
- 包名：`zentao-mcp`
- 使用 MCP 时不需要先 `npm install` 或手动 `npm start`
- 推荐直接在 Codex CLI 的 MCP 配置中通过 `npx` 启动

## Codex CLI 直接可用（推荐）
在 `~/.codex/config.toml` 增加：

```toml
[mcp_servers.zentao]
command = "npx"
args = ["-y", "zentao-mcp"]
env = {
  ZENTAO_BASE_URL = "https://zentao.example.com/",
  ZENTAO_ACCOUNT = "your_account",
  ZENTAO_PASSWORD = "your_password"
}
startup_timeout_sec = 60.0
tool_timeout_sec = 60.0
```

重启 Codex CLI 后即可直接自然语言调用禅道工具。

## 多用户账号方式
- 每个使用者只需在自己的 MCP 配置中填写自己的禅道账号密码
- 默认读取 `env` 中的 `ZENTAO_BASE_URL/ZENTAO_ACCOUNT/ZENTAO_PASSWORD`
- 也支持在单次工具调用里传 `baseUrl/account/password` 覆盖
- 覆盖参数必须 3 个字段同时提供，否则返回 `INVALID_ARGUMENT`

## 功能
- MCP Server（stdio）
- 10 个工具：
  - `zentao_health_check`
  - `zentao_list_projects`
  - `zentao_get_project`
  - `zentao_list_executions`
  - `zentao_list_stories`
  - `zentao_get_story`
  - `zentao_list_tasks`
  - `zentao_get_task`
  - `zentao_list_bugs`
  - `zentao_get_bug`
- `ZenTaoAuthClient`（Token 获取与缓存）
- `ZenTaoApiClient`（端点封装、鉴权重试、错误映射）

## 发布与分发
- 本地打包：`npm run pack:local`（会产出 `.tgz`）
- 发布前构建：`npm run prepack`
- 发布到 npm：`npm publish`（需先登录 npm）
- 详细发布流程见：[docs/PUBLISH.md](./docs/PUBLISH.md)

## 环境变量
- `ZENTAO_BASE_URL`
- `ZENTAO_ACCOUNT`
- `ZENTAO_PASSWORD`
- `ZENTAO_TIMEOUT_MS`（默认 `10000`）
- `ZENTAO_TOKEN_TTL_MS`（默认 `3000000`）
- `MCP_DEFAULT_PAGE`（默认 `1`）
- `MCP_DEFAULT_LIMIT`（默认 `20`）
- `MCP_MAX_LIMIT`（默认 `100`）

## 本地开发
1. 复制配置文件：`.env.example` -> `.env`
2. 安装依赖：`npm install`
3. 类型检查：`npm run check`
4. 运行测试：`npm run test`
5. 构建：`npm run build`
6. 启动（stdio）：`npm start`

## 说明
- 当前版本已实现 10 个只读工具，覆盖项目/执行/需求/任务/Bug 的列表与详情查询。
- 返回结果包含标准化字段映射，并保留 `raw` 原始响应用于排障。
- 测试覆盖了参数校验、scope 路由和错误码映射等关键路径。
